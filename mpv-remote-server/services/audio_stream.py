import asyncio
import logging
from pathlib import Path
import sys
import time
from typing import Dict, Set

import aiofiles
from fastapi import WebSocket
from models.model import AudioStreamConfig, PCMChunk

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


class AudioStreamService:
    def __init__(self) -> None:
        self.config = AudioStreamConfig()
        self.active_streams: Dict[str, asyncio.Task] = {}
        self.ws_clients: Dict[str, Set[WebSocket]] = {}
        self.pipe_paths: Dict[str, Path] = {}

    def get_named_pipe_path(self, instance_id: str) -> Path:
        if sys.platform == "win32":
            return Path(f"\\\\.\\pipe\\mpv_audio_{instance_id}")
        else:
            raise NotImplementedError("Only Windows is supported for now")

    async def start_stream(self, instance_id: str) -> None:
        if instance_id in self.active_streams:
            logger.warning(f"Stream for instance {instance_id} already running")
            return

        pipe_path = self.get_named_pipe_path(instance_id=instance_id)
        self.pipe_paths[instance_id] = pipe_path

        task = asyncio.create_task(self._stream_reader(instance_id, pipe_path))
        self.active_streams[instance_id] = task

    async def stop_stream(self, instance_id: str) -> None:
        if instance_id in self.active_streams:
            self.active_streams[instance_id].cancel()
            del self.active_streams[instance_id]

        if instance_id in self.ws_clients:
            for ws in self.ws_clients[instance_id]:
                await ws.close()
            del self.ws_clients[instance_id]

    async def _stream_reader(self, instance_id: str, pipe_path: Path) -> None:
        chunk_sz = self.config.chunk_size
        chunk_duration_ns = self.config.chunk_ms * 1_000_000

        try:
            logger.info(f"Starting audio stream reader for instance {instance_id}")

            retry_ct = 0

            while not pipe_path.exists() and retry_ct < 30:
                await asyncio.sleep(0.5)
                retry_ct += 1

            if not pipe_path.exists():
                logger.error(f"Pipe {pipe_path} does not exist after 15 seconds")
                return

            async with aiofiles.open(pipe_path, "rb") as pipe:
                next_chunk_time = time.time_ns()

                while True:
                    try:
                        pcm_data = await pipe.read(chunk_sz)

                        if not pcm_data:
                            logger.warning(f"No data from pipe for {instance_id}")
                            await asyncio.sleep(0.01)
                            continue

                        if len(pcm_data) < chunk_sz:
                            pcm_data += b"\x00" * (chunk_sz - len(pcm_data))

                        current_time = time.time()
                        ts_sec = int(current_time)
                        ts_usec = int((current_time % 1) * 1_000_000)

                        chunk = PCMChunk(
                            ts_sec=ts_sec,
                            ts_usec=ts_usec,
                            size=len(pcm_data),
                            payload=pcm_data,
                        )

                        await self._broadcast_chunk(instance_id, chunk)

                        next_chunk_time += chunk_duration_ns
                        sleep_time = (next_chunk_time - time.time_ns()) / 1_000_000_000

                        if sleep_time > 0:
                            await asyncio.sleep(sleep_time)

                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.error(
                            f"Error in audio stream reader for {instance_id}: {e}"
                        )
                        await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error in audio stream reader for {instance_id}: {e}")
        finally:
            logger.info(f"Stopping audio stream reader for {instance_id}")

    async def _broadcast_chunk(self, instance_id: str, chunk: PCMChunk) -> None:
        if instance_id not in self.ws_clients:
            return

        disconnected = set()

        wire_data = chunk.to_wire_format()

        for ws in self.ws_clients[instance_id]:
            try:
                await ws.send_bytes(wire_data)
            except Exception as e:
                logger.warning(f"Error sending chunk to client: {e}")
                disconnected.add(ws)

        for ws in disconnected:
            self.ws_clients[instance_id].discard(ws)

    async def add_ws_client(self, instance_id: str, ws: WebSocket) -> None:
        if instance_id not in self.ws_clients:
            self.ws_clients[instance_id] = set()

        self.ws_clients[instance_id].add(ws)

    async def remove_ws_client(self, instance_id: str, ws: WebSocket) -> None:
        if instance_id in self.ws_clients and ws in self.ws_clients[instance_id]:
            self.ws_clients[instance_id].discard(ws)


audio_stream_service = AudioStreamService()
