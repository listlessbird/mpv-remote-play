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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)

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

    try:
        while True:
            # Notify clients when new segments are available
            try:
                segment_info = segments_ready.get_nowait()
                await websocket.send_json(
                    {"type": "new_segment", "segment": segment_info}
                )
            except queue.Empty:
                pass

            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(websocket)


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


async def start_hls_encoding(media_file: str):
    """Start the HLS encoding process"""
    global encoding_active

    if encoding_active:
        logger.warning("Encoding already active")
        return False

    logger.info(f"Starting HLS encoding for: {media_file}")
    encoding_active = True

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
        # Start HLS encoding
        if await start_hls_encoding(sample_file):
            logger.info("HLS encoding started successfully")
        else:
            logger.error("Failed to start HLS encoding")
            return

        # Run web server
        config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="info")
        server = uvicorn.Server(config)

        logger.info("Starting server on http://localhost:8000")
        logger.info("Open in browser to play HLS audio stream")
        logger.info("Audio will be encoded to HLS segments with high quality")

        await server.serve()

    finally:
        # Cleanup
        global hls_encoder, file_observer, hls_output_dir, encoding_active
        encoding_active = False

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
