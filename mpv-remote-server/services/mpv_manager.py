import asyncio
from datetime import datetime
import json
import subprocess
import uuid
from typing import Optional

from models.model import (
    MPVInstance,
    MPVCommand,
    MPVResponse,
    RemoteCommand,
    RemoteCommandAction,
    MPVStatus,
    MPVAudioSubtitleTrack,
)


class MPVManager:
    def __init__(self):
        self.instances: dict[str, MPVInstance] = {}
        self.request_count = 0

    async def create_instance(self, media_file: Optional[str] = None) -> str:
        instance_id = str(uuid.uuid4())
        pipe_name = f"mpvsocket_{instance_id}"
        pipe_address = f"\\\\.\\pipe\\{pipe_name}"

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

            if media_file:
                args.append(media_file)

            process = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            instance.process = process

            await asyncio.sleep(2.0)

            try:
                await self.send_command(
                    instance_id,
                    MPVCommand(
                        command=["get_property", "mpv-version"], **{"async": None}
                    ),
                    allow_starting=True,
                )
                instance.status = MPVStatus.RUNNING
            except Exception as e:
                instance.status = MPVStatus.ERROR
                raise Exception("MPV Started but IPC failed")

            asyncio.create_task(self._monitor_process(instance_id, process))
            asyncio.create_task(self._clean_dead_instances())

            return instance_id

        except Exception as e:
            instance.status = MPVStatus.ERROR
            raise e

    async def _monitor_process(self, instance_id: str, process: subprocess.Popen):
        await asyncio.create_subprocess_exec(
            *[],
            stdout=process.stdout,
            stderr=process.stderr,
        )
        exit_code = await asyncio.to_thread(process.wait)

        if instance_id in self.instances:
            self.instances[instance_id].status = MPVStatus.STOPPED

    async def send_command(
        self, instance_id: str, cmd: MPVCommand, allow_starting: bool = False
    ) -> MPVResponse:
        instance = self.instances.get(instance_id)

        if not instance:
            raise Exception(f"MPV Instance {instance_id} not found")

        valid_stats = (
            [MPVStatus.STARTING, MPVStatus.RUNNING]
            if allow_starting
            else [MPVStatus.RUNNING]
        )

        if instance.status not in valid_stats:
            raise Exception(
                f"MPV Instance {instance_id} is not in a valid state ({instance.status})"
            )

        pipe_address = f"\\\\.\\pipe\\{instance.pipe_name}"

        reader, writer = await asyncio.open_connection(pipe_address)

        request_id = self.request_count
        self.request_count += 1

        cmd_dict = cmd.model_dump(exclude_none=True)
        cmd_dict["request_id"] = request_id
        cmd_json = json.dumps(cmd_dict) + "\n"

        writer.write(cmd_json.encode())
        await writer.drain()

        try:
            while True:
                line = await asyncio.wait_for(reader.readline(), timeout=10.0)
                if not line:
                    break

                line_str = line.decode().strip()
                if line_str:
                    try:
                        res = json.loads(line_str)
                        if res.get("request_id") == request_id:
                            return MPVResponse(**res)
                    except json.JSONDecodeError:
                        continue
        finally:
            writer.close()
            await writer.wait_closed()
        raise Exception("Timeout waiting for response from MPV")

    async def execute_remote_command(
        self, instance_id: str, remote_cmd: RemoteCommand
    ) -> MPVResponse:
        mpv_command: MPVCommand

        if remote_cmd.action in [RemoteCommandAction.PLAY, RemoteCommandAction.PAUSE]:
            mpv_command = MPVCommand(command=["cycle", "pause"], **{})

        elif remote_cmd.action == RemoteCommandAction.STOP:
            mpv_command = MPVCommand(command=["stop"], **{})

        elif remote_cmd.action == RemoteCommandAction.LOADFILE:
            file_path = remote_cmd.params.get("file") if remote_cmd.params else None
            mode = (
                remote_cmd.params.get("mode", "replace")
                if remote_cmd.params
                else "replace"
            )

            if not file_path:
                raise ValueError("File path is required for loadfile command")
            mpv_command = MPVCommand(command=["loadfile", file_path, mode], **{})

        elif remote_cmd.action == RemoteCommandAction.SEEK:
            seek_time = remote_cmd.params.get("time", 0) if remote_cmd.params else 0
            seek_type = (
                remote_cmd.params.get("type", "absolute")
                if remote_cmd.params
                else "absolute"
            )
            mpv_command = MPVCommand(command=["seek", str(seek_time), seek_type], **{})

        elif remote_cmd.action == RemoteCommandAction.VOLUME:
            if remote_cmd.params and "level" in remote_cmd.params:
                mpv_command = MPVCommand(
                    command=["set_property", "volume", str(remote_cmd.params["level"])],
                    **{},
                )
            else:
                mpv_command = MPVCommand(command=["get_property", "volume"], **{})

        elif remote_cmd.action == RemoteCommandAction.GET_PROPERTY:
            property_name = (
                remote_cmd.params.get("property") if remote_cmd.params else None
            )
            if not property_name:
                raise ValueError("Property is required for get_property command")
            mpv_command = MPVCommand(command=["get_property", property_name], **{})

        elif remote_cmd.action == RemoteCommandAction.SET_PROPERTY:
            if (
                not remote_cmd.params
                or "property" not in remote_cmd.params
                or "value" not in remote_cmd.params
            ):
                raise ValueError(
                    "Property and value are required for set_property command"
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
            raise ValueError(f"Unknown action: {remote_cmd.action}")

        return await self.send_command(instance_id, mpv_command)

    async def get_available_tracks(
        self,
        instance_id: str,
    ):
        tracks_response = await self.send_command(
            instance_id=instance_id,
            cmd=MPVCommand(command=["get_property", "track-list"], **{}),
        )

        tracks = tracks_response.data or []

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

        return {
            "audioTracks": audio_tracks,
            "subtitleTracks": subtitle_tracks,
        }

    async def set_audio_track(self, instance_id: str, track_id: str):
        return await self.send_command(
            instance_id,
            MPVCommand(command=["set_property", "aid", track_id], **{}),
        )

    async def set_subtitle_track(self, instance_id: str, track_id: str):
        return await self.send_command(
            instance_id,
            MPVCommand(command=["set_property", "sid", track_id], **{}),
        )

    async def get_current_tracks(self, instance_id: str):
        audio_track, subtitle_track = await asyncio.gather(
            self.send_command(
                instance_id, MPVCommand(command=["get_property", "aid"], **{})
            ),
            self.send_command(
                instance_id, MPVCommand(command=["get_property", "sid"], **{})
            ),
        )

        return {"audioTrack": audio_track.data, "subtitleTrack": subtitle_track.data}

    async def get_client_name(self, instance_id: str) -> str:
        instance = self.instances.get(instance_id)
        if not instance:
            raise Exception(f"MPV instance {instance_id} not found")

        cmd_response = await self.send_command(
            instance_id, MPVCommand(command=["client_name"], **{})
        )

        return cmd_response.data or ""

    async def get_instance(self, instance_id: str) -> Optional[MPVInstance]:
        instance = self.instances.get(instance_id)
        if instance:
            try:
                client_name = await self.get_client_name(instance_id)
                instance.client_name = client_name
            except:
                pass
        return instance

    async def get_all_instances(self) -> list[MPVInstance]:
        instances = list(self.instances.values())

        for instance in instances:
            try:
                client_name = await self.get_client_name(instance.id)
                instance.client_name = client_name
            except:
                pass

        return instances

    async def stop_instance(self, instance_id: str):
        instance = self.instances.get(instance_id)
        if instance and instance.process:
            try:
                await self.send_command(instance_id, MPVCommand(command=["quit"], **{}))
            except:
                if instance.process and hasattr(instance.process, "terminate"):
                    instance.process.terminate()
            instance.status = MPVStatus.STOPPED

    async def _clean_dead_instances(self):
        await asyncio.sleep(5 * 60)
        now = datetime.now()
        dead_instances = []

        for instance_id, instance in self.instances.items():
            if (
                instance.status == MPVStatus.ERROR
                or (now - instance.last_seen).total_seconds() > 5 * 60
            ):
                dead_instances.append(instance_id)

        for instance_id in dead_instances:
            del self.instances[instance_id]


mpv_manager = MPVManager()
