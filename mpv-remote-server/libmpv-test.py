import os


if os.name == "nt":
    os.environ["PATH"] = os.path.dirname(__file__) + os.pathsep + os.environ["PATH"]

os.add_dll_directory(os.getcwd())

import asyncio
import struct
import time
import threading
import queue
import tempfile
import os
import subprocess
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import logging
from pathlib import Path
import io
import shutil
import json
import glob
import watchdog.events
import watchdog.observers
import mpv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# HLS configuration
SEGMENT_DURATION = 6  # HLS segment duration in seconds
TARGET_BITRATE = "256k"  # High quality bitrate

# Global state
ws_clients: Set[WebSocket] = set()
hls_encoder = None
hls_output_dir = None
segments_ready = queue.Queue()
file_observer = None
encoding_active = False
mpv_player = None
current_media_file = None
mpv_state_queue = queue.Queue()  # Thread-safe queue for MPV state changes

app = FastAPI()


@app.get("/")
async def get():
    return FileResponse("hls-audio-test.html")


@app.get("/playlist.m3u8")
async def get_playlist():
    """Serve the HLS master playlist"""
    if not hls_output_dir or not os.path.exists(
        os.path.join(hls_output_dir, "playlist.m3u8")
    ):
        return Response("Playlist not ready", status_code=404)

    try:
        with open(os.path.join(hls_output_dir, "playlist.m3u8"), "r") as f:
            content = f.read()
        return Response(content, media_type="application/vnd.apple.mpegurl")
    except Exception as e:
        logger.error(f"Error reading playlist: {e}")
        return Response("Error reading playlist", status_code=500)


@app.get("/segment{segment_num:int}.aac")
async def get_segment(segment_num: int):
    """Serve HLS audio segments"""
    if not hls_output_dir:
        return Response("Segments not ready", status_code=404)

    segment_file = os.path.join(hls_output_dir, f"segment{segment_num}.aac")
    if not os.path.exists(segment_file):
        return Response("Segment not found", status_code=404)

    try:
        with open(segment_file, "rb") as f:
            content = f.read()
        return Response(content, media_type="audio/aac")
    except Exception as e:
        logger.error(f"Error reading segment {segment_num}: {e}")
        return Response("Error reading segment", status_code=500)


async def broadcast_to_clients(message):
    """Broadcast message to all connected WebSocket clients"""
    if not ws_clients:
        return

    disconnected_clients = set()
    for client in ws_clients.copy():
        try:
            await client.send_json(message)
        except Exception as e:
            logger.debug(f"Client disconnected during broadcast: {e}")
            disconnected_clients.add(client)

    # Remove disconnected clients
    ws_clients.difference_update(disconnected_clients)


async def process_mpv_state_queue():
    """Process MPV state changes from the queue and broadcast to clients"""
    try:
        while True:
            try:
                state_change = mpv_state_queue.get_nowait()
                await broadcast_to_clients(state_change)
            except queue.Empty:
                await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)
    logger.info(f"WebSocket client connected. Total clients: {len(ws_clients)}")

    # Send initial config
    await websocket.send_json(
        {
            "type": "config",
            "segment_duration": SEGMENT_DURATION,
            "bitrate": TARGET_BITRATE,
            "codec": "hls",
            "playlist_url": "/playlist.m3u8",
        }
    )

    # Send current MPV state if available
    if mpv_player:
        try:
            initial_state = {
                "type": "mpv_state",
                "paused": getattr(mpv_player, "pause", True),
                "time_pos": getattr(mpv_player, "time_pos", 0) or 0,
                "duration": getattr(mpv_player, "duration", 0) or 0,
                "volume": getattr(mpv_player, "volume", 100) or 100,
                "playback_time": getattr(mpv_player, "playback_time", 0) or 0,
                "percent_pos": getattr(mpv_player, "percent_pos", 0) or 0,
                "seekable": getattr(mpv_player, "seekable", False) or False,
                "core_idle": getattr(mpv_player, "core_idle", True) or True,
                "filename": getattr(mpv_player, "filename", None),
                "media_title": getattr(mpv_player, "media_title", None),
            }
            await websocket.send_json(initial_state)
            logger.info("Sent initial MPV state to client")
        except Exception as e:
            logger.warning(f"Failed to send initial MPV state: {e}")
            # Send minimal state as fallback
            await websocket.send_json(
                {
                    "type": "mpv_state",
                    "paused": True,
                    "time_pos": 0,
                    "duration": 0,
                    "volume": 100,
                }
            )

    try:
        while True:
            # Handle new segments
            try:
                segment_info = segments_ready.get_nowait()
                await websocket.send_json(
                    {"type": "new_segment", "segment": segment_info}
                )
            except queue.Empty:
                pass

            # Handle incoming commands
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                await handle_websocket_command(data)
            except asyncio.TimeoutError:
                pass
            except Exception as e:
                logger.debug(f"WebSocket receive error: {e}")
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        ws_clients.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(ws_clients)}")


async def handle_websocket_command(data):
    """Handle commands from WebSocket clients"""
    if not mpv_player:
        return

    try:
        command_type = data.get("type")

        if command_type == "play":
            mpv_player.pause = False
            logger.info("MPV: Play command")

        elif command_type == "pause":
            mpv_player.pause = True
            logger.info("MPV: Pause command")

        elif command_type == "toggle_pause":
            mpv_player.pause = not mpv_player.pause
            logger.info(
                f"MPV: Toggle pause - now {'paused' if mpv_player.pause else 'playing'}"
            )

        elif command_type == "seek":
            position = data.get("position", 0)
            seek_type = data.get("type", "absolute")
            try:
                # Use MPV's seek command instead of setting time_pos directly
                if seek_type == "relative":
                    mpv_player.command("seek", position, "relative")
                else:
                    mpv_player.command("seek", position, "absolute")
                logger.info(f"MPV: Seek to {position} ({seek_type})")
            except Exception as e:
                logger.error(f"MPV: Seek failed: {e}")

        elif command_type == "volume":
            volume = data.get("volume", 100)
            volume = max(0, min(100, volume))
            try:
                mpv_player.volume = volume
                logger.info(f"MPV: Volume set to {volume}")
            except Exception as e:
                logger.error(f"MPV: Volume set failed: {e}")

        elif command_type == "get_property":
            property_name = data.get("property")
            if property_name:
                try:
                    value = getattr(mpv_player, property_name.replace("-", "_"), None)
                    mpv_state_queue.put_nowait(
                        {
                            "type": "property_response",
                            "property": property_name,
                            "value": value,
                        }
                    )
                    logger.info(f"MPV: Get property {property_name} = {value}")
                except Exception as e:
                    logger.error(f"MPV: Get property {property_name} failed: {e}")

        elif command_type == "set_property":
            property_name = data.get("property")
            property_value = data.get("value")
            if property_name and property_value is not None:
                try:
                    setattr(mpv_player, property_name.replace("-", "_"), property_value)
                    logger.info(f"MPV: Set property {property_name} = {property_value}")
                except Exception as e:
                    logger.error(f"MPV: Set property {property_name} failed: {e}")

    except Exception as e:
        logger.error(f"Error handling WebSocket command: {e}")


class HLSSegmentHandler(watchdog.events.FileSystemEventHandler):
    """File system event handler to monitor new HLS segments"""

    def __init__(self):
        self.last_segment_num = -1

    def on_created(self, event):
        if event.is_directory:
            return

        file_path = str(event.src_path)
        file_name = str(os.path.basename(file_path))

        # Check if it's a segment file
        if file_name.startswith("segment") and file_name.endswith(".aac"):
            try:
                # Extract segment number
                segment_num = int(file_name.replace("segment", "").replace(".aac", ""))

                # Only process if it's a new segment
                if segment_num > self.last_segment_num:
                    self.last_segment_num = segment_num

                    # Wait a moment for the file to be completely written
                    time.sleep(0.1)

                    if os.path.exists(file_path):
                        segment_info = {
                            "name": file_name,
                            "url": f"/{file_name}",
                            "size": os.path.getsize(file_path),
                            "number": segment_num,
                        }

                        try:
                            segments_ready.put_nowait(segment_info)
                            logger.info(f"New HLS segment detected: {file_name}")
                        except queue.Full:
                            pass  # Skip if queue is full

            except (ValueError, OSError) as e:
                logger.error(f"Error processing segment file {file_name}: {e}")


def setup_mpv_player(media_file: str):
    """Set up MPV player with audio output disabled to avoid conflicts"""
    global mpv_player, current_media_file

    try:
        # Create MPV instance with null audio output to avoid conflicts with HLS stream
        mpv_player = mpv.MPV(ao="null", log_handler=logger.debug)
        current_media_file = media_file

        # Set up property observers for state synchronization using thread-safe queue
        @mpv_player.property_observer("pause")
        def on_pause_change(name, value):
            if value is not None:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "paused",
                            "value": value,
                        }
                    )
                    logger.info(f"MPV pause state changed: {value}")
                except queue.Full:
                    pass

        @mpv_player.property_observer("time-pos")
        def on_time_pos_change(name, value):
            if value is not None and value >= 0:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "time_pos",
                            "value": float(value),
                        }
                    )
                except queue.Full:
                    pass

        @mpv_player.property_observer("volume")
        def on_volume_change(name, value):
            if value is not None:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "volume",
                            "value": float(value),
                        }
                    )
                    logger.info(f"MPV volume changed: {value}")
                except queue.Full:
                    pass

        @mpv_player.property_observer("duration")
        def on_duration_change(name, value):
            if value is not None and value > 0:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "duration",
                            "value": float(value),
                        }
                    )
                    logger.info(f"MPV duration changed: {value}")
                except queue.Full:
                    pass

        @mpv_player.property_observer("playback-time")
        def on_playback_time_change(name, value):
            if value is not None and value >= 0:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "playback_time",
                            "value": float(value),
                        }
                    )
                except queue.Full:
                    pass

        @mpv_player.property_observer("percent-pos")
        def on_percent_pos_change(name, value):
            if value is not None and value >= 0:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "percent_pos",
                            "value": float(value),
                        }
                    )
                except queue.Full:
                    pass

        @mpv_player.property_observer("seekable")
        def on_seekable_change(name, value):
            if value is not None:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "seekable",
                            "value": bool(value),
                        }
                    )
                    logger.info(f"MPV seekable changed: {value}")
                except queue.Full:
                    pass

        @mpv_player.property_observer("core-idle")
        def on_core_idle_change(name, value):
            if value is not None:
                try:
                    mpv_state_queue.put_nowait(
                        {
                            "type": "mpv_state_change",
                            "property": "core_idle",
                            "value": bool(value),
                        }
                    )
                    logger.info(f"MPV core-idle changed: {value}")
                except queue.Full:
                    pass

        # Load the media file
        mpv_player.play(media_file)
        mpv_player.pause = True  # Start paused

        logger.info(f"MPV player initialized with: {media_file}")
        return True

    except Exception as e:
        logger.error(f"Failed to setup MPV player: {e}")
        return False


def setup_hls_encoder(media_file: str):
    """Set up FFmpeg process for direct HLS encoding from media file"""
    global hls_encoder, hls_output_dir, file_observer

    # Create temporary directory for HLS output
    hls_output_dir = tempfile.mkdtemp(prefix="hls_audio_")
    logger.info(f"HLS output directory: {hls_output_dir}")

    # Get media file info first
    probe_cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        media_file,
    ]

    try:
        result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        media_info = json.loads(result.stdout)

        # Find audio stream info
        audio_stream = None
        for stream in media_info.get("streams", []):
            if stream.get("codec_type") == "audio":
                audio_stream = stream
                break

        if audio_stream:
            sample_rate = audio_stream.get("sample_rate", "48000")
            channels = audio_stream.get("channels", 2)
            codec_name = audio_stream.get("codec_name", "unknown")
            logger.info(
                f"Source audio: {codec_name}, {sample_rate}Hz, {channels} channels"
            )
        else:
            logger.warning("No audio stream found in media file")

    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as e:
        logger.error(f"Failed to probe media file: {e}")
        sample_rate = "48000"
        channels = 2

    logger.info(f"Setting up FFmpeg HLS encoder for: {media_file}")

    # FFmpeg command for direct HLS encoding with high quality
    cmd = [
        "ffmpeg",
        "-i",
        media_file,  # Input media file
        "-map",
        "0:a:0",  # Map first audio stream only
        "-c:a",
        "aac",  # AAC codec for HLS
        "-b:a",
        TARGET_BITRATE,  # High bitrate for quality
        "-profile:a",
        "aac_low",  # AAC profile
        "-ar",
        str(sample_rate),  # Preserve sample rate
        "-ac",
        str(channels),  # Preserve channel count
        "-avoid_negative_ts",
        "make_zero",  # Fix timing issues
        "-f",
        "hls",  # HLS output format
        "-hls_time",
        str(SEGMENT_DURATION),  # Segment duration
        "-hls_list_size",
        "0",  # Keep all segments in playlist
        "-hls_flags",
        "independent_segments",  # Make segments independent
        "-hls_segment_filename",
        os.path.join(hls_output_dir, "segment%d.aac"),
        "-hls_base_url",
        "/",  # Base URL for segments
        "-y",  # Overwrite output
        os.path.join(hls_output_dir, "playlist.m3u8"),
    ]

    try:
        hls_encoder = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        logger.info("HLS encoder started")
        logger.info(f"FFmpeg command: {' '.join(cmd)}")

        # Set up file system watcher for new segments
        event_handler = HLSSegmentHandler()
        file_observer = watchdog.observers.Observer()
        file_observer.schedule(event_handler, hls_output_dir, recursive=False)
        file_observer.start()
        logger.info("File system watcher started for HLS segments")

        # Start a thread to log FFmpeg stderr
        def log_ffmpeg_stderr():
            try:
                while hls_encoder and hls_encoder.stderr:
                    line = hls_encoder.stderr.readline()
                    if not line:
                        break
                    line_str = line.decode().strip()
                    if (
                        line_str
                        and not line_str.startswith("frame=")
                        and "time=" not in line_str
                    ):
                        logger.info(f"FFmpeg: {line_str}")
            except Exception as e:
                logger.error(f"Error in FFmpeg stderr monitoring: {e}")

        threading.Thread(target=log_ffmpeg_stderr, daemon=True).start()
        return True

    except Exception as e:
        logger.error(f"Failed to start HLS encoder: {e}")
        return False


def monitor_encoding_progress():
    """Monitor the encoding progress and handle completion"""
    global encoding_active, hls_encoder

    if not hls_encoder:
        return

    try:
        # Wait for the encoding process to complete
        return_code = hls_encoder.wait()

        if return_code == 0:
            logger.info("HLS encoding completed successfully")
        else:
            logger.error(f"HLS encoding failed with return code: {return_code}")

    except Exception as e:
        logger.error(f"Error monitoring encoding: {e}")
    finally:
        encoding_active = False
        logger.info("Encoding monitoring ended")


async def start_media_setup(media_file: str):
    """Start both MPV player and HLS encoding"""
    global encoding_active

    if encoding_active:
        logger.warning("Media setup already active")
        return False

    logger.info(f"Starting media setup for: {media_file}")
    encoding_active = True

    # Set up MPV player first
    if not setup_mpv_player(media_file):
        encoding_active = False
        return False

    # Set up HLS encoder
    if not setup_hls_encoder(media_file):
        encoding_active = False
        return False

    # Start monitoring thread
    threading.Thread(target=monitor_encoding_progress, daemon=True).start()

    return True


async def main():
    """Main function"""
    sample_file = str(Path("../samples") / "sample1.mp4")

    # Check if media file exists
    if not os.path.exists(sample_file):
        logger.error(f"Media file not found: {sample_file}")
        logger.error("Please add an audio/video file to the samples directory.")
        return

    logger.info(f"Using media file: {sample_file}")

    try:
        # Start media setup (MPV + HLS)
        if await start_media_setup(sample_file):
            logger.info("Media setup started successfully")
        else:
            logger.error("Failed to start media setup")
            return

        # Start the MPV state queue processor as a background task
        state_processor_task = asyncio.create_task(process_mpv_state_queue())

        # Run web server
        config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="info")
        server = uvicorn.Server(config)

        logger.info("Starting server on http://localhost:8000")
        logger.info("Open in browser to play HLS audio stream")
        logger.info("Audio will be synced with MPV playback state")
        logger.info("Use WebSocket commands to control playback:")
        logger.info('  - {"type": "play"}')
        logger.info('  - {"type": "pause"}')
        logger.info('  - {"type": "toggle_pause"}')
        logger.info('  - {"type": "seek", "position": 30}')
        logger.info('  - {"type": "volume", "volume": 75}')

        try:
            await server.serve()
        finally:
            state_processor_task.cancel()

    finally:
        # Cleanup
        global hls_encoder, file_observer, hls_output_dir, encoding_active, mpv_player
        encoding_active = False

        if mpv_player:
            try:
                mpv_player.terminate()
                logger.info("MPV player terminated")
            except:
                pass

        if file_observer:
            try:
                file_observer.stop()
                file_observer.join()
                logger.info("File system watcher stopped")
            except:
                pass

        if hls_encoder:
            try:
                hls_encoder.terminate()
                hls_encoder.wait(timeout=5)
            except:
                try:
                    hls_encoder.kill()
                except:
                    pass

        # Clean up HLS output directory
        if hls_output_dir and os.path.exists(hls_output_dir):
            try:
                shutil.rmtree(hls_output_dir)
                logger.info(f"Cleaned up HLS directory: {hls_output_dir}")
            except:
                pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
