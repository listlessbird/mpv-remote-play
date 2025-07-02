import json
from config import settings
from services.mpv_manager import mpv_manager
from services.shares import MediaShare
from models.model import (
    HLSSegmentInfo,
    MPVCommand,
    MPVResponse,
    RemoteCommand,
)
from services.hls_stream import hls_stream_service

from datetime import datetime
import time
from fastapi import FastAPI, HTTPException, Response, WebSocket
from fastapi.responses import FileResponse
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import asyncio

import logging

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

share_service = MediaShare()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await share_service.init()
    yield
    await share_service.shutdown()


app = FastAPI(title="MPV Remote Control Server", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def get_client():
    return FileResponse("client-test.html")


@app.get("/api/status")
async def get_status():
    return {
        "status": "OK",
        "timestamp": datetime.now().isoformat(),
        "stats": share_service.get_stats(),
    }


@app.get("/api/instances")
async def get_instances():
    instances = await mpv_manager.get_all_instances()
    return [
        {
            "id": i.id,
            "status": i.status,
            "lastSeen": i.last_seen,
            "clientName": i.client_name,
        }
        for i in instances
    ]


@app.post("/api/instances")
async def create_instance(body: Dict = {}):
    media_file = body.get("mediaFile")
    stream_audio = body.get("streamAudio", False)

    if media_file:
        if not Path(media_file).exists():
            raise HTTPException(status_code=404, detail="Media file not found")

    all_instances = await mpv_manager.get_all_instances()
    running_instances = [i for i in all_instances if i.status == "running"]

    # Explicitly deny multiple instances - always return the first running instance
    if running_instances:
        running_instance_id = running_instances[0].id
        logger.info(
            f"Instance creation denied - reusing existing instance {running_instance_id}"
        )

        # If there are multiple running instances, log warning but still return the first one
        if len(running_instances) > 1:
            logger.warning(
                f"Found {len(running_instances)} running instances, should clean up extras"
            )

        # Optionally load new media file if provided
        if media_file is not None:
            try:
                await mpv_manager.send_command(
                    running_instance_id,
                    MPVCommand(command=["loadfile", media_file], **{}),
                )
                logger.info(f"Loaded media file {media_file} into existing instance")
            except Exception as error:
                logger.error(
                    f"Failed to load media file into existing instance: {error}"
                )

        return {
            "instanceId": running_instance_id,
            "message": "Instance creation denied - reusing existing instance",
        }

    # Only create new instance if no running instances exist
    try:
        instance_id = await mpv_manager.create_instance(
            media_file, stream_audio=stream_audio
        )
        logger.info(f"Created new instance {instance_id}")
        return {
            "instanceId": instance_id,
            "message": "MPV instance created successfully, streamAudio: "
            + str(stream_audio),
        }
    except Exception as error:
        error_msg = str(error)
        if "another instance is already running" in error_msg:
            logger.warning(
                f"Instance creation rejected due to existing instance: {error}"
            )
            # This should not happen due to our checks above, but just in case
            all_instances = await mpv_manager.get_all_instances()
            running_instances = [i for i in all_instances if i.status == "running"]
            if running_instances:
                return {
                    "instanceId": running_instances[0].id,
                    "message": "Instance creation rejected - reusing existing instance",
                }

        raise HTTPException(
            status_code=500, detail=f"Failed to create instance: {error}"
        )


@app.get("/api/instances/{instance_id}")
async def get_instance(instance_id: str):
    instance = await mpv_manager.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    return instance


@app.delete("/api/instances/{instance_id}")
async def delete_instance(instance_id: str):
    try:
        await mpv_manager.stop_instance(instance_id)
        return {"message": "Instance stopped"}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to stop instance: {error}")


@app.post("/api/instances/{instance_id}/command")
async def send_command(instance_id: str, command: RemoteCommand):
    try:
        result = await mpv_manager.execute_remote_command(instance_id, command)
        return result
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Failed to execute command: {error}"
        )


@app.get("/api/instances/{instance_id}/tracks")
async def get_tracks(instance_id: str):
    try:
        tracks = await mpv_manager.get_available_tracks(instance_id)
        current = await mpv_manager.get_current_tracks(instance_id)
        return {**tracks, **current}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to get tracks: {error}")


@app.post("/api/instances/{instance_id}/tracks")
async def set_track(instance_id: str, body: Dict):
    try:
        track_type = body.get("type")
        track_id = body.get("trackId")

        if track_type == "audio":
            await mpv_manager.set_audio_track(instance_id, str(track_id))
        elif track_type == "subtitle":
            await mpv_manager.set_subtitle_track(instance_id, str(track_id))
        else:
            raise HTTPException(status_code=400, detail="Invalid track type")

        return {"message": "Track set successfully"}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to set track: {error}")


@app.get("/api/shares")
async def get_shares():
    shares = list(settings.media_shares.keys())
    return {"shares": shares}


@app.get("/api/shares/{share}")
async def get_share_contents(share: str):
    try:
        result = await share_service.get_share_files(share)
        return {**result.dict(), "path": "/"}
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error))


@app.get("/api/shares/{share}/{path:path}")
async def get_share_path_contents(share: str, path: str = ""):
    try:
        result = await share_service.get_share_files(share, path)
        return {**result.dict(), "path": f"/{path}"}
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error))


@app.get("/api/thumbnails/{thumbnail_id}")
async def get_thumbnail(thumbnail_id: str):
    if thumbnail_id.endswith(".jpg"):
        thumbnail_id = thumbnail_id[:-4]

    thumbnail_path = share_service.get_thumbnail_path(thumbnail_id)

    if not thumbnail_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(
        thumbnail_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000"},
    )


@app.get("/api/instances/{instance_id}/hls/playlist.m3u8")
async def get_hls_playlist(instance_id: str):
    playlist_path = await hls_stream_service.get_playlist_path(instance_id)
    if not playlist_path:
        raise HTTPException(status_code=404, detail="HLS playlist not found")

    with open(playlist_path, "r") as f:
        content = f.read()

    return Response(content, media_type="application/vnd.apple.mpegurl")


@app.get("/api/instances/{instance_id}/hls/segment{segment_num}.aac")
async def get_hls_segment(instance_id: str, segment_num: int):
    segment_path = await hls_stream_service.get_segment_path(instance_id, segment_num)
    if not segment_path:
        raise HTTPException(status_code=404, detail="HLS segment not found")

    with open(segment_path, "rb") as f:
        content = f.read()

    return Response(content, media_type="audio/aac")


@app.websocket("/api/instances/{instance_id}/state")
async def get_player_state(websocket: WebSocket, instance_id: str):
    await websocket.accept()
    # logger.debug(f"WebSocket connected for instance {instance_id}")

    while True:
        try:
            instance = await mpv_manager.get_instance(instance_id)
            if not instance:
                logger.warning(f"Instance {instance_id} not found")
                await websocket.send_json({"error": "Instance not found"})
                await asyncio.sleep(1)
                continue

            cmds = [
                MPVCommand(command=["get_property", "time-pos"], **{}),
                MPVCommand(command=["get_property", "duration"], **{}),
                MPVCommand(command=["get_property", "pause"], **{}),
                MPVCommand(command=["get_property", "volume"], **{}),
                MPVCommand(command=["get_property", "title"], **{}),
            ]

            # Send commands and collect results
            tasks = [mpv_manager.send_command(instance_id, cmd) for cmd in cmds]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # logger.debug(f"Results: {results}")

            processed_results = [
                {
                    "command": cmd.command,
                    "data": result.model_dump()
                    if isinstance(result, MPVResponse)
                    else None,
                }
                for cmd, result in zip(cmds, results)
            ]

            await websocket.send_json(processed_results)
            await asyncio.sleep(3)

        except Exception as error:
            logger.error(f"WebSocket error for instance {instance_id}: {error}")
            try:
                await websocket.close(code=1011, reason="Internal server error")
            except:
                pass
            break


@app.get("/api/instances/{instance_id}/hls/status")
async def get_hls_status(instance_id: str):
    status = await hls_stream_service.get_stream_status(instance_id)

    return status.model_dump_json()


@app.websocket("/api/instances/{instance_id}/hls-events")
async def hls_events_socket(ws: WebSocket, instance_id: str):
    await ws.accept()
    logger.info(f"HLS events socket connected for instance {instance_id}")

    if instance_id not in hls_stream_service.ws_clients:
        hls_stream_service.ws_clients[instance_id] = set()
    hls_stream_service.ws_clients[instance_id].add(ws)

    async def on_segment(seg_info: HLSSegmentInfo):
        try:
            await ws.send_json(
                {
                    "type": "segment",
                    "data": seg_info.model_dump_json(),
                }
            )
        except Exception as e:
            logger.error(f"Error sending segment event to client: {e}")

    async def on_ready(instance_id: str):
        try:
            status = await hls_stream_service.get_stream_status(instance_id)
            await ws.send_json(
                {
                    "type": "ready",
                    "data": status.model_dump_json(),
                }
            )
        except Exception as e:
            logger.error(f"Error sending ready event to client: {e}")

    hls_stream_service.add_segment_callback(instance_id, on_segment)
    hls_stream_service.add_on_ready_callback(instance_id, on_ready)

    status = await hls_stream_service.get_stream_status(instance_id)
    await ws.send_json(
        {
            "type": "ready",
            "data": status.model_dump_json(),
        }
    )

    try:
        while True:
            await ws.receive_text()
    except Exception as e:
        logger.error(f"HLS events socket error for instance {instance_id}: {e}")
    finally:
        hls_stream_service.ws_clients[instance_id].discard(ws)
        hls_stream_service.remove_segment_callback(instance_id, on_segment)
