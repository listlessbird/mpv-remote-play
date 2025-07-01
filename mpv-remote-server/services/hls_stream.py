import asyncio
import json
import logging
import shutil
import subprocess
import threading
from typing import Callable, Dict, Optional, Set, TypedDict
from concurrent.futures import ThreadPoolExecutor

from fastapi import WebSocket
from watchdog.observers import Observer
from watchdog.observers.api import BaseObserver
from watchdog.events import FileSystemEventHandler
from pathlib import Path

from models.model import HLSConfig, HLSSegmentInfo, HLSStreamStatus
from config import settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False


class HLSSegmentHandler(FileSystemEventHandler):
    def __init__(self, instance_id: str, callback: Callable):
        self.instance_id = instance_id
        self.callback = callback
        self.last_segment_num = -1

    def on_created(self, event):
        if event.is_directory:
            return

        file_name = Path(str(event.src_path)).name
        if file_name.startswith("segment") and file_name.endswith(".aac"):
            try:
                segment_num = int(file_name.replace("segment", "").replace(".aac", ""))
                if segment_num > self.last_segment_num:
                    self.last_segment_num = segment_num
                    segment_info = HLSSegmentInfo(
                        name=file_name,
                        url=f"/api/instances/{self.instance_id}/hls/{file_name}",
                        number=segment_num,
                        size=Path(str(event.src_path)).stat().st_size,
                        instanceId=self.instance_id,
                    )
                    asyncio.create_task(self.callback(segment_info))
            except (ValueError, OSError) as e:
                logger.error(f"Error processing segment file {file_name}: {e}")


class StreamInfo(TypedDict):
    process: subprocess.Popen
    playlist_path: Path
    output_dir: Path
    config: HLSConfig
    media_file: str


class HLSStreamService:
    def __init__(self) -> None:
        self.active_streams: Dict[str, StreamInfo] = {}
        self.segment_watchers: Dict[str, BaseObserver] = {}
        self.segment_callbacks: Dict[str, Set[Callable]] = {}
        self.ws_clients: Dict[str, Set[WebSocket]] = {}
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.min_segment_for_ready = settings.hls_min_segment_for_ready
        self.stream_readiness: Dict[str, bool] = {}
        self.segment_counts: Dict[str, int] = {}
        self.on_ready_cbs: Dict[str, Set[Callable]] = {}

    async def is_stream_ready(self, instance_id: str) -> bool:
        return self.stream_readiness.get(instance_id, False)

    async def wait_until_stream_ready(
        self, instance_id: str, timeout: float = 10.0
    ) -> bool:
        start_t = asyncio.get_event_loop().time()
        while (asyncio.get_event_loop().time() - start_t) < timeout:
            if await self.is_stream_ready(instance_id):
                return True
            await asyncio.sleep(0.5)
        return False

    def add_on_ready_callback(self, instance_id: str, callback: Callable):
        if instance_id not in self.on_ready_cbs:
            self.on_ready_cbs[instance_id] = set()
        self.on_ready_cbs[instance_id].add(callback)

    async def start_stream(
        self, instance_id: str, media_file: str, config: Optional[HLSConfig] = None
    ) -> bool:
        if instance_id in self.active_streams:
            logger.error(f"Stream already active for instance {instance_id}")
            return False

        if config is None:
            config = HLSConfig()

        out_dir = Path(settings.hls_dir) / instance_id
        playlist_path = out_dir / "playlist.m3u8"

        if not out_dir.exists():
            out_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Starting HLS stream for {media_file} in {out_dir}")

        try:
            probe_info = await self._probe_media_file(media_file)
            audio_info = probe_info.get("audio", {})

            cmd = [
                "ffmpeg",
                "-i",
                media_file,
                "-map",
                "0:a:0",
                "-c:a",
                "aac",
                "-b:a",
                config.bitrate,
                "-profile:a",
                "aac_low",
                "-ar",
                str(audio_info.get("sample_rate", 48000)),
                "-ac",
                str(audio_info.get("channels", 2)),
                "-avoid_negative_ts",
                "make_zero",
                "-f",
                "hls",
                "-hls_time",
                str(config.segment_duration),
                "-hls_list_size",
                "0",
                "-hls_flags",
                "independent_segments",
                "-hls_segment_filename",
                str(out_dir / "segment%d.aac"),
                "-hls_base_url",
                f"/api/instances/{instance_id}/hls/",
                "-y",
                str(playlist_path),
            ]

            logger.debug(f"Running FFmpeg command: {' '.join(cmd)}")

            def start_ffmpeg():
                try:
                    process = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        bufsize=0,
                    )
                    return process
                except Exception as e:
                    logger.error(f"Failed to start FFmpeg process: {e}")
                    return None

            loop = asyncio.get_event_loop()
            process = await loop.run_in_executor(self.executor, start_ffmpeg)

            if process is None:
                raise Exception("Failed to start FFmpeg process")

            self.active_streams[instance_id] = StreamInfo(
                process=process,
                playlist_path=playlist_path,
                output_dir=out_dir,
                config=config,
                media_file=media_file,
            )

            handler = HLSSegmentHandler(instance_id, self._handle_new_segment)
            observer = Observer()
            observer.schedule(handler, str(out_dir), recursive=True)
            observer.start()
            self.segment_watchers[instance_id] = observer

            asyncio.create_task(self._monitor_process(instance_id, process))
            asyncio.create_task(self._periodic_segment_check(instance_id))
            self._log_ffmpeg_stderr(instance_id, process)

            logger.info(f"HLS stream for {media_file} started in {out_dir}")
            return True

        except Exception as e:
            logger.error(
                f"Failed to start HLS stream for {instance_id}: {type(e).__name__}: {e}"
            )
            logger.error(f"Media file: {media_file}")
            logger.error(f"Output directory: {out_dir}")
            if out_dir.exists():
                try:
                    shutil.rmtree(out_dir)
                    logger.debug(f"Cleaned up output directory: {out_dir}")
                except Exception as cleanup_error:
                    logger.error(f"Failed to cleanup output directory: {cleanup_error}")
            return False

    async def stop_stream(self, instance_id: str):
        if instance_id not in self.active_streams:
            return

        logger.info(f"Stopping HLS stream for {instance_id}")

        self.stream_readiness.pop(instance_id, None)
        self.segment_counts.pop(instance_id, None)
        self.on_ready_cbs.pop(instance_id, None)

        stream = self.active_streams[instance_id]
        process = stream["process"]
        out_dir = stream["output_dir"]

        if instance_id in self.segment_watchers:
            self.segment_watchers[instance_id].stop()
            self.segment_watchers[instance_id].join()
            del self.segment_watchers[instance_id]

        if process and process.returncode is None:
            process.terminate()
            try:

                def wait_for_termination():
                    return process.wait()

                loop = asyncio.get_event_loop()
                await asyncio.wait_for(
                    loop.run_in_executor(self.executor, wait_for_termination),
                    timeout=10,
                )
            except asyncio.TimeoutError:
                process.kill()

                def wait_for_kill():
                    return process.wait()

                await loop.run_in_executor(self.executor, wait_for_kill)

        if out_dir.exists():
            try:
                shutil.rmtree(out_dir)
                logger.info(f"Removed HLS output directory {out_dir}")
            except Exception as e:
                logger.error(f"Error removing HLS output directory {out_dir}: {e}")

        del self.active_streams[instance_id]
        self.segment_callbacks.pop(instance_id, None)
        self.ws_clients.pop(instance_id, None)
        logger.info(f"HLS stream for {instance_id} stopped")

    async def _probe_media_file(self, media_file: str) -> Dict:
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            media_file,
        ]

        try:
            logger.debug(f"Running ffprobe command: {' '.join(cmd)}")

            def run_ffprobe():
                try:
                    result = subprocess.run(
                        cmd, capture_output=True, text=True, timeout=30
                    )
                    return result.returncode, result.stdout, result.stderr
                except FileNotFoundError:
                    return None, None, "ffprobe not found"
                except subprocess.TimeoutExpired:
                    return -1, None, "ffprobe timed out"
                except Exception as e:
                    return -1, None, str(e)

            loop = asyncio.get_event_loop()
            returncode, stdout_text, stderr_text = await loop.run_in_executor(
                self.executor, run_ffprobe
            )

            stdout_text = stdout_text or ""
            stderr_text = stderr_text or ""

            if returncode is None:
                logger.error(
                    "ffprobe not found - make sure FFmpeg is installed and in PATH"
                )
                return {
                    "audio": {
                        "codec": "unknown",
                        "bitrate": "unknown",
                        "channels": 2,
                        "sample_rate": 48000,
                    }
                }

            if returncode != 0:
                logger.error(f"ffprobe failed with return code {returncode}")
                logger.error(f"ffprobe stderr: {stderr_text}")
                return {
                    "audio": {
                        "codec": "unknown",
                        "bitrate": "unknown",
                        "channels": 2,
                        "sample_rate": 48000,
                    }
                }

            logger.debug(f"ffprobe stdout length: {len(stdout_text)} chars")

            if not stdout_text.strip():
                logger.error("ffprobe returned empty output")
                return {
                    "audio": {
                        "codec": "unknown",
                        "bitrate": "unknown",
                        "channels": 2,
                        "sample_rate": 48000,
                    }
                }

            data = json.loads(stdout_text)
            audio_info = {}

            for stream in data.get("streams", []):
                if stream.get("codec_type") == "audio":
                    audio_info = {
                        "codec": stream.get("codec_name"),
                        "bitrate": stream.get("bit_rate"),
                        "channels": stream.get("channels"),
                        "sample_rate": stream.get("sample_rate"),
                    }
                    break

            logger.debug(f"Extracted audio info: {audio_info}")
            return {"audio": audio_info}

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse ffprobe JSON output for {media_file}: {e}")
            logger.error(f"Raw stdout: {stdout_text}")
            return {
                "audio": {
                    "codec": "unknown",
                    "bitrate": "unknown",
                    "channels": 2,
                    "sample_rate": 48000,
                }
            }
        except Exception as e:
            logger.error(
                f"Error probing media file {media_file}: {type(e).__name__}: {e}"
            )
            return {
                "audio": {
                    "codec": "unknown",
                    "bitrate": "unknown",
                    "channels": 2,
                    "sample_rate": 48000,
                }
            }

    async def _monitor_process(self, instance_id: str, process):
        try:

            def wait_for_process():
                return process.wait()

            loop = asyncio.get_event_loop()
            ret_code = await loop.run_in_executor(self.executor, wait_for_process)

            if ret_code == 0:
                logger.info(f"HLS encoding completed for instance {instance_id}")
            else:
                logger.error(f"HLS encoding failed for instance {instance_id}")
        except Exception as e:
            logger.error(f"Error monitoring process {instance_id}: {e}")

    def _log_ffmpeg_stderr(self, instance_id: str, process):
        def log_ffmpeg_stderr():
            try:
                while process and process.stderr:
                    line = process.stderr.readline()
                    if not line:
                        break
                    line_str = line.decode().strip()
                    if (
                        line_str
                        and not line_str.startswith("frame=")
                        and "time=" not in line_str
                    ):
                        logger.info(f"FFmpeg [{instance_id}]: {line_str}")
            except Exception as e:
                logger.error(
                    f"Error in FFmpeg stderr monitoring for {instance_id}: {e}"
                )

        threading.Thread(target=log_ffmpeg_stderr, daemon=True).start()

    async def get_playlist_path(self, instance_id: str) -> Optional[Path]:
        stream = self.active_streams.get(instance_id)
        if stream and stream["playlist_path"].exists():
            return stream["playlist_path"]
        return None

    async def get_segment_path(
        self, instance_id: str, segment_num: int
    ) -> Optional[Path]:
        stream = self.active_streams.get(instance_id)
        if stream:
            segment_path = stream["output_dir"] / f"segment{segment_num}.aac"
            if segment_path.exists():
                return segment_path
        return None

    def add_segment_callback(self, instance_id: str, callback: Callable):
        if instance_id not in self.segment_callbacks:
            self.segment_callbacks[instance_id] = set()
        self.segment_callbacks[instance_id].add(callback)

    def remove_segment_callback(self, instance_id: str, callback: Callable):
        if instance_id in self.segment_callbacks:
            self.segment_callbacks[instance_id].discard(callback)

    async def _handle_new_segment(self, segment_info: HLSSegmentInfo):
        instance_id = segment_info.instance_id

        self.segment_counts[instance_id] = self.segment_counts.get(instance_id, 0) + 1

        if not self.stream_readiness.get(instance_id, False):
            if self.segment_counts[instance_id] > self.min_segment_for_ready:
                self.stream_readiness[instance_id] = True
                logger.info(f"HLS Stream for {instance_id} is ready")

                for callback in self.on_ready_cbs.get(instance_id, set()):
                    try:
                        await callback(instance_id)
                    except Exception as e:
                        logger.error(f"Error in hls on_ready callback: {e}")

        callbacks = self.segment_callbacks.get(instance_id, set())
        for callback in callbacks:
            try:
                await callback(segment_info)
            except Exception as e:
                logger.error(f"Error in segment callback: {e}")

    async def _periodic_segment_check(self, instance_id: str):
        logger.debug(f"Starting periodic segment check for {instance_id}")

        while instance_id in self.active_streams:
            try:
                stream = self.active_streams.get(instance_id)
                if not stream:
                    break

                out_dir = stream["output_dir"]

                if out_dir.exists():
                    segment_files = list(out_dir.glob("segment*.aac"))
                    current_count = len(segment_files)

                    old_count = self.segment_counts.get(instance_id, 0)

                    if current_count > old_count:
                        logger.debug(
                            f"Found {current_count} segments for {instance_id} (was {old_count})"
                        )
                        self.segment_counts[instance_id] = current_count

                        if not self.stream_readiness.get(instance_id, False):
                            if current_count >= self.min_segment_for_ready:
                                self.stream_readiness[instance_id] = True
                                logger.info(
                                    f"HLS Stream for {instance_id} is ready (fallback check)"
                                )

                                for callback in self.on_ready_cbs.get(
                                    instance_id, set()
                                ):
                                    try:
                                        await callback(instance_id)
                                    except Exception as e:
                                        logger.error(
                                            f"Error in hls on_ready callback: {e}"
                                        )

                await asyncio.sleep(1.0)

            except Exception as e:
                logger.error(f"Error in periodic segment check for {instance_id}: {e}")
                await asyncio.sleep(2.0)

        logger.debug(f"Stopped periodic segment check for {instance_id}")

    async def get_stream_status(self, instance_id: str) -> HLSStreamStatus:
        stream = self.active_streams.get(instance_id)
        if not stream:
            return HLSStreamStatus(
                status="not_found",
                segmentCount=0,
                playlistUrl="",
                mediaFile="",
            )

        return HLSStreamStatus(
            status="ready"
            if self.stream_readiness.get(instance_id, False)
            else "generating",
            segmentCount=self.segment_counts.get(instance_id, 0),
            playlistUrl=f"/api/instances/{instance_id}/hls/playlist.m3u8",
            mediaFile=stream["media_file"],
        )

    async def shutdown(self):
        for instance_id in list(self.active_streams.keys()):
            await self.stop_stream(instance_id)

        for instance_id in list(self.segment_watchers.keys()):
            self.segment_watchers[instance_id].stop()
            self.segment_watchers[instance_id].join()
            del self.segment_watchers[instance_id]

        for instance_id in list(self.on_ready_cbs.keys()):
            self.on_ready_cbs[instance_id].clear()
            del self.on_ready_cbs[instance_id]

        self.segment_callbacks.clear()
        self.ws_clients.clear()
        self.stream_readiness.clear()
        self.segment_counts.clear()
        self.on_ready_cbs.clear()

        self.executor.shutdown(wait=True)
        logger.info("HLS stream service shutdown complete")


hls_stream_service = HLSStreamService()
