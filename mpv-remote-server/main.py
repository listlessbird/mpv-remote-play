import asyncio
import sys
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from config import settings
from services.mpv_manager import mpv_manager
from services.shares import MediaShare
from models.model import MPVCommand, RemoteCommand, Track, ShareScanResult

share_service = MediaShare()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await share_service.init()
    yield
    await share_service.shutdown()


app = FastAPI(title="MPV Remote Control Server", lifespan=lifespan)


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

    if media_file:
        if not Path(media_file).exists():
            raise HTTPException(status_code=404, detail="Media file not found")

    all_instances = await mpv_manager.get_all_instances()
    running_instances = [i for i in all_instances if i.status == "running"]

    if running_instances:
        running_instance_id = running_instances[0].id

        if media_file is not None:
            try:
                await mpv_manager.send_command(
                    running_instance_id,
                    MPVCommand(command=["loadfile", media_file], **{}),
                )
                return {
                    "instanceId": running_instance_id,
                    "message": "Reused existing MPV instance",
                }
            except Exception as error:
                print(f"Failed to send command to existing instance: {error}")
                print("Creating new instance")
        else:
            return {
                "instanceId": running_instance_id,
                "message": "Reused existing MPV instance",
            }

    try:
        instance_id = await mpv_manager.create_instance(media_file)
        return {
            "instanceId": instance_id,
            "message": "MPV instance created successfully",
        }
    except Exception as error:
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
