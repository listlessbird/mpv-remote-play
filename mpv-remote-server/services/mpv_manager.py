import asyncio
from datetime import datetime
import json
import logging
import subprocess
import uuid
import sys
from typing import Optional

if sys.platform == "win32":
    import win32file
    import pywintypes

from models.model import (
    MPVInstance,
    MPVCommand,
    MPVResponse,
    RemoteCommand,
    RemoteCommandAction,
    MPVStatus,
)

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


class MPVManager:
    def __init__(self):
        self.instances: dict[str, MPVInstance] = {}
        self.request_count = 0
        logger.info("MPVManager initialized")

    async def create_instance(
        self,
        media_file: Optional[str] = None,
        stream_audio: bool = False,
    ) -> str:
        instance_id = str(uuid.uuid4())
        pipe_name = f"mpvsocket_{instance_id}"

        if sys.platform == "win32":
            pipe_address = f"\\\\.\\pipe\\{pipe_name}"
        else:
            pipe_address = f"/tmp/{pipe_name}"

        logger.info(f"Creating MPV instance {instance_id} with pipe {pipe_name}")
        if media_file:
            logger.info(f"Loading media file: {media_file}")

        instance = MPVInstance(
            id=instance_id,
            pipeName=pipe_name,
            status=MPVStatus.STARTING,
            lastSeen=datetime.now(),
            process=None,
            clientName=None,
        )

        self.instances[instance_id] = instance

        try:
            args = [
                "mpv",
                "--player-operation-mode=pseudo-gui",
                "--idle=yes",
                "--force-window=yes",
                "--sub-auto=fuzzy",
                "--slang=en,eng",
                f"--input-ipc-server={pipe_address}",
            ]

            if stream_audio:
                args.append("--ao=null")

            if media_file:
                args.append(media_file)

            logger.debug(f"Starting MPV with args: {args}")
            process = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            instance.process = process
            logger.debug(f"MPV process started with PID: {process.pid}")

            await asyncio.sleep(2.0)

            try:
                logger.debug(f"Testing IPC connection for instance {instance_id}")
                await self.send_command(
                    instance_id,
                    MPVCommand(
                        command=["get_property", "mpv-version"], **{"async": None}
                    ),
                    allow_starting=True,
                )
                instance.status = MPVStatus.RUNNING
                logger.info(f"MPV instance {instance_id} is now running")
            except Exception as e:
                instance.status = MPVStatus.ERROR
                logger.error(f"IPC connection failed for instance {instance_id}: {e}")
                raise Exception("MPV Started but IPC failed")

            if stream_audio and media_file:
                from services.hls_stream import hls_stream_service

                asyncio.create_task(
                    hls_stream_service.start_stream(instance_id, media_file)
                )

            asyncio.create_task(self._monitor_process(instance_id, process))
            asyncio.create_task(self._clean_dead_instances())

            return instance_id

        except Exception as e:
            instance.status = MPVStatus.ERROR
            logger.error(f"Failed to create MPV instance {instance_id}: {e}")
            raise e

    async def _monitor_process(self, instance_id: str, process: subprocess.Popen):
        logger.debug(f"Starting process monitor for instance {instance_id}")
        await asyncio.create_subprocess_exec(
            *[],
            stdout=process.stdout,
            stderr=process.stderr,
        )
        exit_code = await asyncio.to_thread(process.wait)
        logger.info(
            f"MPV process for instance {instance_id} exited with code {exit_code}"
        )

        if instance_id in self.instances:
            self.instances[instance_id].status = MPVStatus.STOPPED
            logger.info(f"Instance {instance_id} status set to STOPPED")

    async def _connect_to_windows_pipe(self, pipe_address: str):
        """Connect to a Windows named pipe using win32 API"""

        def connect_pipe():
            try:
                handle = win32file.CreateFile(
                    pipe_address,
                    win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                    0,
                    None,
                    win32file.OPEN_EXISTING,
                    0,
                    None,
                )
                return handle
            except pywintypes.error as e:
                logger.error(f"Failed to connect to pipe {pipe_address}: {e}")
                raise Exception(f"Failed to connect to pipe: {e}")

        return await asyncio.to_thread(connect_pipe)

    async def _write_to_windows_pipe(self, handle, data: bytes):
        """Write data to Windows named pipe"""

        def write_pipe():
            try:
                win32file.WriteFile(handle, data)
                win32file.FlushFileBuffers(handle)
            except pywintypes.error as e:
                logger.error(f"Failed to write to pipe: {e}")
                raise Exception(f"Failed to write to pipe: {e}")

        await asyncio.to_thread(write_pipe)

    async def _read_from_windows_pipe(self, handle, timeout: float = 10.0) -> bytes:
        """Read data from Windows named pipe with timeout"""

        def read_pipe() -> bytes:
            try:
                result, data = win32file.ReadFile(handle, 4096)
                return data
            except pywintypes.error as e:
                logger.error(f"Failed to read from pipe: {e}")
                raise Exception(f"Failed to read from pipe: {e}")

        return await asyncio.wait_for(asyncio.to_thread(read_pipe), timeout=timeout)

    async def _close_windows_pipe(self, handle):
        """Close Windows named pipe handle"""

        def close_pipe():
            try:
                win32file.CloseHandle(handle)
            except pywintypes.error as e:
                logger.warning(f"Error closing pipe handle: {e}")

        await asyncio.to_thread(close_pipe)

    async def send_command(
        self, instance_id: str, cmd: MPVCommand, allow_starting: bool = False
    ) -> MPVResponse:
        logger.debug(f"Sending command to instance {instance_id}: {cmd.command}")

        instance = self.instances.get(instance_id)

        if not instance:
            logger.error(f"MPV Instance {instance_id} not found")
            raise Exception(f"MPV Instance {instance_id} not found")

        valid_stats = (
            [MPVStatus.STARTING, MPVStatus.RUNNING]
            if allow_starting
            else [MPVStatus.RUNNING]
        )

        if instance.status not in valid_stats:
            logger.error(
                f"MPV Instance {instance_id} is not in a valid state ({instance.status})"
            )
            raise Exception(
                f"MPV Instance {instance_id} is not in a valid state ({instance.status})"
            )

        if sys.platform == "win32":
            pipe_address = f"\\\\.\\pipe\\{instance.pipe_name}"
        else:
            pipe_address = f"/tmp/{instance.pipe_name}"

        logger.debug(f"Connecting to pipe: {pipe_address}")

        request_id = self.request_count
        self.request_count += 1

        cmd_dict = cmd.model_dump(exclude_none=True)
        cmd_dict["request_id"] = request_id
        cmd_json = json.dumps(cmd_dict) + "\n"

        logger.debug(
            f"Sending command with request_id {request_id}: {cmd_json.strip()}"
        )

        if sys.platform == "win32":
            return await self._send_command_windows(pipe_address, cmd_json, request_id)
        else:
            return await self._send_command_unix(pipe_address, cmd_json, request_id)

    async def _send_command_windows(
        self, pipe_address: str, cmd_json: str, request_id: int
    ) -> MPVResponse:
        """Send command using Windows named pipes"""
        handle = None
        try:
            handle = await self._connect_to_windows_pipe(pipe_address)
            await self._write_to_windows_pipe(handle, cmd_json.encode())

            buffer = b""
            while True:
                try:
                    data = await self._read_from_windows_pipe(handle, timeout=10.0)
                    if not data:
                        break

                    buffer += data
                    lines = buffer.split(b"\n")
                    buffer = lines[-1]  # Keep incomplete line in buffer

                    for line in lines[:-1]:  # Process complete lines
                        if line.strip():
                            line_str = line.decode().strip()
                            logger.debug(f"Received response: {line_str}")
                            try:
                                res = json.loads(line_str)
                                if res.get("request_id") == request_id:
                                    logger.debug(
                                        f"Found matching response for request_id {request_id}"
                                    )
                                    return MPVResponse(**res)
                            except json.JSONDecodeError as e:
                                logger.warning(
                                    f"Failed to decode JSON response: {line_str}, error: {e}"
                                )
                                continue
                except asyncio.TimeoutError:
                    logger.error(f"Timeout waiting for response from MPV instance")
                    raise Exception("Timeout waiting for response from MPV")

        finally:
            if handle:
                await self._close_windows_pipe(handle)

        logger.error(f"No matching response found for request_id {request_id}")
        raise Exception("No matching response found")

    async def _send_command_unix(
        self, pipe_address: str, cmd_json: str, request_id: int
    ) -> MPVResponse:
        """Send command using Unix domain sockets"""
        reader, writer = await asyncio.open_connection(path=pipe_address)

        writer.write(cmd_json.encode())
        await writer.drain()

        try:
            while True:
                line = await asyncio.wait_for(reader.readline(), timeout=10.0)
                if not line:
                    logger.debug(f"No more data from MPV instance")
                    break

                line_str = line.decode().strip()
                if line_str:
                    logger.debug(f"Received response: {line_str}")
                    try:
                        res = json.loads(line_str)
                        if res.get("request_id") == request_id:
                            logger.debug(
                                f"Found matching response for request_id {request_id}"
                            )
                            return MPVResponse(**res)
                    except json.JSONDecodeError as e:
                        logger.warning(
                            f"Failed to decode JSON response: {line_str}, error: {e}"
                        )
                        continue
        finally:
            writer.close()
            await writer.wait_closed()

        logger.error(f"Timeout waiting for response from MPV instance")
        raise Exception("Timeout waiting for response from MPV")

    async def execute_remote_command(
        self, instance_id: str, remote_cmd: RemoteCommand
    ) -> MPVResponse:
        logger.info(
            f"Executing remote command {remote_cmd.action} on instance {instance_id}"
        )

        mpv_command: MPVCommand

        if remote_cmd.action in [RemoteCommandAction.PLAY, RemoteCommandAction.PAUSE]:
            logger.debug("Executing play/pause toggle")
            mpv_command = MPVCommand(command=["cycle", "pause"], **{})

        elif remote_cmd.action == RemoteCommandAction.STOP:
            logger.debug("Executing stop command")
            mpv_command = MPVCommand(command=["stop"], **{})

        elif remote_cmd.action == RemoteCommandAction.LOADFILE:
            file_path = remote_cmd.params.get("file") if remote_cmd.params else None
            mode = (
                remote_cmd.params.get("mode", "replace")
                if remote_cmd.params
                else "replace"
            )

            if not file_path:
                logger.error("File path is required for loadfile command")
                raise ValueError("File path is required for loadfile command")

            logger.debug(f"Loading file: {file_path} with mode: {mode}")
            mpv_command = MPVCommand(command=["loadfile", file_path, mode], **{})

        elif remote_cmd.action == RemoteCommandAction.SEEK:
            seek_time = remote_cmd.params.get("time", 0) if remote_cmd.params else 0
            seek_type = (
                remote_cmd.params.get("type", "absolute")
                if remote_cmd.params
                else "absolute"
            )
            logger.debug(f"Seeking to {seek_time} ({seek_type})")
            mpv_command = MPVCommand(command=["seek", str(seek_time), seek_type], **{})

        elif remote_cmd.action == RemoteCommandAction.VOLUME:
            if remote_cmd.params and "level" in remote_cmd.params:
                logger.debug(f"Setting volume to {remote_cmd.params['level']}")
                mpv_command = MPVCommand(
                    command=["set_property", "volume", str(remote_cmd.params["level"])],
                    **{},
                )
            else:
                logger.debug("Getting current volume")
                mpv_command = MPVCommand(command=["get_property", "volume"], **{})

        elif remote_cmd.action == RemoteCommandAction.GET_PROPERTY:
            property_name = (
                remote_cmd.params.get("property") if remote_cmd.params else None
            )
            if not property_name:
                logger.error("Property is required for get_property command")
                raise ValueError("Property is required for get_property command")

            logger.debug(f"Getting property: {property_name}")
            mpv_command = MPVCommand(command=["get_property", property_name], **{})

        elif remote_cmd.action == RemoteCommandAction.SET_PROPERTY:
            if (
                not remote_cmd.params
                or "property" not in remote_cmd.params
                or "value" not in remote_cmd.params
            ):
                logger.error("Property and value are required for set_property command")
                raise ValueError(
                    "Property and value are required for set_property command"
                )

            logger.debug(
                f"Setting property {remote_cmd.params['property']} to {remote_cmd.params['value']}"
            )
            mpv_command = MPVCommand(
                command=[
                    "set_property",
                    remote_cmd.params["property"],
                    remote_cmd.params["value"],
                ],
                **{},
            )

        else:
            logger.error(f"Unknown action: {remote_cmd.action}")
            raise ValueError(f"Unknown action: {remote_cmd.action}")

        return await self.send_command(instance_id, mpv_command)

    async def get_available_tracks(
        self,
        instance_id: str,
    ):
        logger.debug(f"Getting available tracks for instance {instance_id}")

        tracks_response = await self.send_command(
            instance_id=instance_id,
            cmd=MPVCommand(command=["get_property", "track-list"], **{}),
        )

        tracks = tracks_response.data or []
        logger.debug(f"Found {len(tracks)} tracks")

        audio_tracks = [
            {
                "id": t.get("id"),
                "title": t.get("title", f"Audio Track {t.get('id')}"),
                "lang": t.get("lang", "Unknown"),
                "codec": t.get("codec", "Unknown"),
                "default": t.get("default", False),
                "selected": t.get("selected", False),
            }
            for t in tracks
            if t.get("type") == "audio"
        ]

        subtitle_tracks = [
            {
                "id": t.get("id"),
                "title": t.get("title", f"Subtitle {t.get('id')}"),
                "lang": t.get("lang", "Unknown"),
                "codec": t.get("codec", "Unknown"),
                "default": t.get("default", False),
                "selected": t.get("selected", False),
            }
            for t in tracks
            if t.get("type") == "sub"
        ]

        logger.debug(
            f"Found {len(audio_tracks)} audio tracks and {len(subtitle_tracks)} subtitle tracks"
        )
        return {
            "audioTracks": audio_tracks,
            "subtitleTracks": subtitle_tracks,
        }

    async def set_audio_track(self, instance_id: str, track_id: str):
        logger.debug(f"Setting audio track to {track_id} for instance {instance_id}")
        return await self.send_command(
            instance_id,
            MPVCommand(command=["set_property", "aid", track_id], **{}),
        )

    async def set_subtitle_track(self, instance_id: str, track_id: str):
        logger.debug(f"Setting subtitle track to {track_id} for instance {instance_id}")
        return await self.send_command(
            instance_id,
            MPVCommand(command=["set_property", "sid", track_id], **{}),
        )

    async def get_current_tracks(self, instance_id: str):
        logger.debug(f"Getting current tracks for instance {instance_id}")

        audio_track, subtitle_track = await asyncio.gather(
            self.send_command(
                instance_id, MPVCommand(command=["get_property", "aid"], **{})
            ),
            self.send_command(
                instance_id, MPVCommand(command=["get_property", "sid"], **{})
            ),
        )

        logger.debug(
            f"Current audio track: {audio_track.data}, subtitle track: {subtitle_track.data}"
        )
        return {"audioTrack": audio_track.data, "subtitleTrack": subtitle_track.data}

    async def get_client_name(self, instance_id: str) -> str:
        logger.debug(f"Getting client name for instance {instance_id}")

        instance = self.instances.get(instance_id)
        if not instance:
            logger.error(f"MPV instance {instance_id} not found")
            raise Exception(f"MPV instance {instance_id} not found")

        cmd_response = await self.send_command(
            instance_id, MPVCommand(command=["client_name"], **{})
        )

        client_name = cmd_response.data or ""
        logger.debug(f"Client name for instance {instance_id}: {client_name}")
        return client_name

    async def get_instance(self, instance_id: str) -> Optional[MPVInstance]:
        logger.debug(f"Getting instance {instance_id}")

        instance = self.instances.get(instance_id)
        if instance:
            try:
                client_name = await self.get_client_name(instance_id)
                instance.client_name = client_name
            except Exception as e:
                logger.warning(
                    f"Failed to get client name for instance {instance_id}: {e}"
                )
        else:
            logger.warning(f"Instance {instance_id} not found")
        return instance

    async def get_all_instances(self) -> list[MPVInstance]:
        logger.debug(f"Getting all instances (count: {len(self.instances)})")

        instances = list(self.instances.values())

        for instance in instances:
            try:
                client_name = await self.get_client_name(instance.id)
                instance.client_name = client_name
            except Exception as e:
                logger.warning(
                    f"Failed to get client name for instance {instance.id}: {e}"
                )

        return instances

    async def stop_instance(self, instance_id: str):
        logger.info(f"Stopping instance {instance_id}")

        from services.hls_stream import hls_stream_service

        await hls_stream_service.stop_stream(instance_id)

        instance = self.instances.get(instance_id)
        if instance and instance.process:
            try:
                logger.debug(f"Sending quit command to instance {instance_id}")
                await self.send_command(instance_id, MPVCommand(command=["quit"], **{}))
            except Exception as e:
                logger.warning(
                    f"Failed to send quit command to instance {instance_id}: {e}"
                )
                if instance.process and hasattr(instance.process, "terminate"):
                    logger.debug(f"Terminating process for instance {instance_id}")
                    instance.process.terminate()
            instance.status = MPVStatus.STOPPED
            logger.info(f"Instance {instance_id} stopped")
        else:
            logger.warning(f"Instance {instance_id} not found or has no process")

    async def _clean_dead_instances(self):
        logger.debug("Starting dead instance cleanup task")
        await asyncio.sleep(5 * 60)
        now = datetime.now()
        dead_instances = []

        for instance_id, instance in self.instances.items():
            if (
                instance.status == MPVStatus.ERROR
                or (now - instance.last_seen).total_seconds() > 5 * 60
            ):
                dead_instances.append(instance_id)
                logger.debug(
                    f"Marking instance {instance_id} for cleanup (status: {instance.status})"
                )

        for instance_id in dead_instances:
            logger.info(f"Cleaning up dead instance {instance_id}")
            del self.instances[instance_id]

        if dead_instances:
            logger.info(f"Cleaned up {len(dead_instances)} dead instances")


mpv_manager = MPVManager()
