import asyncio
import logging
import subprocess
from pathlib import Path
from typing import Dict, Optional
from concurrent.futures import ThreadPoolExecutor

from models.model import MediaFile, ThumbnailResult
from config import settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.ERROR)

# Configure logging format if not already configured
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False


class ThumbnailGenerator:
    def __init__(self):
        self.queue = asyncio.Queue(maxsize=100)
        self.is_running = True
        self.process_cache: Dict[str, asyncio.Future] = {}
        self.executor = ThreadPoolExecutor(max_workers=2)
        self._ensure_thumbnails_dir()
        self._worker_task = None

    def _ensure_thumbnails_dir(self):
        settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    async def start(self):
        self._worker_task = asyncio.create_task(self._process_queue())

    async def generate_thumbnail(self, media_file: MediaFile) -> ThumbnailResult:
        if not self.is_running:
            raise Exception("Thumbnail generator is not running")

        existing = self.process_cache.get(media_file.id)
        if existing:
            return await existing

        future = asyncio.get_event_loop().create_future()
        self.process_cache[media_file.id] = future

        try:
            result = await self._do_generate_thumbnail(media_file)
            future.set_result(result)
            return result
        except Exception as e:
            future.set_exception(e)
            raise
        finally:
            del self.process_cache[media_file.id]

    def queue_thumbnail(self, media_file: MediaFile):
        if not self.is_running:
            return

        if media_file.id in self.process_cache:
            return

        try:
            self.queue.put_nowait(media_file)
        except asyncio.QueueFull:
            logger.warning(
                "Queue is full, skipping thumbnail generation for %s",
                media_file.filename,
            )

    async def _process_queue(self):
        while self.is_running:
            try:
                media_file = await asyncio.wait_for(self.queue.get(), timeout=5.0)
                try:
                    result = await self._do_generate_thumbnail(media_file)
                    if result.success:
                        logger.info("Thumbnail generated for %s", media_file.filename)
                    else:
                        logger.error(
                            "Failed to generate thumbnail for %s", media_file.filename
                        )
                except Exception as e:
                    logger.error(
                        "Error generating thumbnail for %s: %s", media_file.filename, e
                    )
            except asyncio.TimeoutError:
                continue

    async def _check_ffmpeg_available(self) -> bool:
        try:
            logger.debug("Checking ffmpeg availability...")
            
            def run_ffmpeg_check():
                try:
                    result = subprocess.run(
                        ["ffmpeg", "-version"],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    return result.returncode, result.stdout, result.stderr
                except FileNotFoundError:
                    return None, None, "ffmpeg not found"
                except subprocess.TimeoutExpired:
                    return -1, None, "ffmpeg check timed out"
                except Exception as e:
                    return -1, None, str(e)
            
            loop = asyncio.get_event_loop()
            returncode, stdout, stderr = await loop.run_in_executor(
                self.executor, run_ffmpeg_check
            )
            
            if returncode is None:
                logger.error("FFmpeg not found")
                return False
                
            logger.debug("FFmpeg check return code: %d", returncode)
            if stdout:
                logger.debug("FFmpeg check stdout: %s", stdout[:200])
            if stderr:
                logger.debug("FFmpeg check stderr: %s", stderr[:200])
            return returncode == 0
        except Exception as e:
            logger.error("Error checking ffmpeg availability: %s", e)
            return False

    async def _check_ffprobe_available(self) -> bool:
        try:
            logger.debug("Checking ffprobe availability...")
            
            def run_ffprobe_check():
                try:
                    result = subprocess.run(
                        ["ffprobe", "-version"],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    return result.returncode, result.stdout, result.stderr
                except FileNotFoundError:
                    return None, None, "ffprobe not found"
                except subprocess.TimeoutExpired:
                    return -1, None, "ffprobe check timed out"
                except Exception as e:
                    return -1, None, str(e)
            
            loop = asyncio.get_event_loop()
            returncode, stdout, stderr = await loop.run_in_executor(
                self.executor, run_ffprobe_check
            )
            
            if returncode is None:
                logger.error("FFprobe not found")
                return False
                
            logger.debug("FFprobe check return code: %d", returncode)
            if stdout:
                logger.debug("FFprobe check stdout: %s", stdout[:200])
            if stderr:
                logger.debug("FFprobe check stderr: %s", stderr[:200])
            return returncode == 0
        except Exception as e:
            logger.error("Error checking ffprobe availability: %s", e)
            return False

    async def _do_generate_thumbnail(self, media_file: MediaFile) -> ThumbnailResult:
        thumb_path = settings.thumbnails_dir / f"{media_file.id}.jpg"
        url = f"/api/thumbnails/{media_file.id}"
        logger.debug(
            "Generating thumbnail for %s at %s", media_file.filename, thumb_path
        )

        if thumb_path.exists():
            return ThumbnailResult(
                success=True,
                path=str(thumb_path),
                url=url,
                fileId=media_file.id,
            )

        try:
            logger.debug("Checking if file exists: %s", media_file.path)
            if not Path(media_file.path).exists():
                logger.error("File does not exist: %s", media_file.path)
                return ThumbnailResult(
                    success=False,
                    error="File does not exist",
                    fileId=media_file.id,
                )
            logger.debug("File exists: %s", media_file.path)

            # Check if ffmpeg is available
            if not await self._check_ffmpeg_available():
                logger.error("FFmpeg is not available or not working")
                return ThumbnailResult(
                    success=False,
                    error="FFmpeg not available",
                    fileId=media_file.id,
                )

            duration = await self._get_media_duration(media_file.path)
            seek_time = max(10, int(duration * 0.1))

            ffmpeg_args = [
                "ffmpeg",
                "-ss",
                str(seek_time),
                "-i",
                media_file.path,
                "-vframes",
                "1",
                "-q:v",
                "2",
                "-y",
                str(thumb_path),
            ]
            logger.debug("Running ffmpeg command: %s", " ".join(ffmpeg_args))

            def run_ffmpeg_thumbnail():
                try:
                    result = subprocess.run(
                        ffmpeg_args,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                    return result.returncode, result.stdout, result.stderr
                except subprocess.TimeoutExpired:
                    return -1, None, "ffmpeg thumbnail generation timed out"
                except Exception as e:
                    return -1, None, str(e)

            loop = asyncio.get_event_loop()
            returncode, stdout_text, stderr_text = await loop.run_in_executor(
                self.executor, run_ffmpeg_thumbnail
            )

            stdout_text = stdout_text or ""
            stderr_text = stderr_text or ""

            logger.debug("FFmpeg return code: %d", returncode)
            if stdout_text:
                logger.debug("FFmpeg stdout: %s", stdout_text)
            if stderr_text:
                logger.debug("FFmpeg stderr: %s", stderr_text)

            if returncode != 0:
                error_msg = (
                    stderr_text
                    if stderr_text
                    else f"FFmpeg failed with return code {result.returncode}"
                )
                logger.error(
                    "FFmpeg failed for %s (code %d): %s",
                    media_file.filename,
                    returncode,
                    error_msg,
                )
                if not error_msg.strip():
                    logger.error(
                        "FFmpeg failed but provided no error message. Command was: %s",
                        " ".join(ffmpeg_args),
                    )

            if thumb_path.exists():
                return ThumbnailResult(
                    success=True, path=str(thumb_path), url=url, fileId=media_file.id
                )
            else:
                return ThumbnailResult(
                    success=False,
                    error="Failed to generate thumbnail",
                    fileId=media_file.id,
                )
        except Exception as e:
            logger.exception("Error generating thumbnail for %s", media_file.filename)
            return ThumbnailResult(
                success=False,
                error=str(e),
                fileId=media_file.id,
            )

    async def _get_media_duration(self, file_path: str) -> float:
        try:
            logger.debug("Getting duration for: %s", file_path)

            # Check if ffprobe is available
            if not await self._check_ffprobe_available():
                logger.error("FFprobe is not available or not working")
                return 0.0

            def run_ffprobe_duration():
                try:
                    result = subprocess.run(
                        [
                            "ffprobe",
                            "-v",
                            "quiet",
                            "-show_entries",
                            "format=duration",
                            "-of",
                            "csv=p=0",
                            file_path,
                        ],
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    return result.returncode, result.stdout, result.stderr
                except subprocess.TimeoutExpired:
                    return -1, None, "ffprobe duration check timed out"
                except Exception as e:
                    return -1, None, str(e)

            loop = asyncio.get_event_loop()
            returncode, stdout_text, stderr_text = await loop.run_in_executor(
                self.executor, run_ffprobe_duration
            )

            stdout_text = stdout_text or ""
            stderr_text = stderr_text or ""

            logger.debug("FFprobe return code: %d", returncode)
            if stdout_text:
                logger.debug("FFprobe stdout: %s", stdout_text)
            if stderr_text:
                logger.debug("FFprobe stderr: %s", stderr_text)

            if returncode != 0:
                error_msg = (
                    stderr_text
                    if stderr_text
                    else f"FFprobe failed with return code {result.returncode}"
                )
                logger.error(
                    "FFprobe failed for %s (code %d): %s",
                    file_path,
                    returncode,
                    error_msg,
                )
                if not error_msg.strip():
                    logger.error(
                        "FFprobe failed but provided no error message. Command was: ffprobe -v quiet -show_entries format=duration -of csv=p=0 %s",
                        file_path,
                    )

            duration_str = stdout_text.strip()
            return float(duration_str) if duration_str else 0.0
        except Exception as e:
            logger.exception("Error getting media duration for %s", file_path)
            return 0.0

    def get_thumbnail_path(self, file_id: str) -> Optional[str]:
        thumbnail_path = settings.thumbnails_dir / f"{file_id}.jpg"
        return str(thumbnail_path) if thumbnail_path.exists() else None

    @property
    def queue_size(self) -> int:
        return self.queue.qsize()

    async def shutdown(self):
        self.is_running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

        while not self.queue.empty():
            try:
                self.queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        self.process_cache.clear()
        self.executor.shutdown(wait=True)
