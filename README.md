# MPV Remote Play

A work-in-progress remote media control system that enables to browse and control MPV player sessions from your couch using a mobile device. Browse media files on your PC and remotely start playback sessions.

## Overview

MPV Remote Play consists of two main components:
- **Server** (`/mpv-remote-server`) - A Python/FastAPI backend that manages MPV player instances and serves media from configured shares.
- **Mobile App** (`/expo-app`) - An Expo React Native app for browsing media files and controlling remote MPV sessions.

The system allows you to:
- Browse media libraries from your phone
- Start MPV playback sessions on your PC remotely
- Control playback (play/pause/stop/seek/volume) from your mobile device
- View auto-generated video thumbnails
- Manage multiple concurrent MPV instances

**Planned Features:**
- Audio streaming to mobile client during playback

## Architecture

### Server (`/mpv-remote-server`)
Built with Python using the FastAPI framework, the server provides:

**Core Services:**
- **MPV Manager** - Creates and controls MPV instances via Windows named pipe IPC
- **Media Scanner** - Recursively scans configured share directories for media files
- **Thumbnail Generator** - Asynchronously generates video thumbnails using FFmpeg
- **Share Service** - Manages media libraries and caching
- **API Server** - RESTful endpoints for mobile app communication

**Key Features:**
- Real-time file system watching for automatic media discovery
- Queued thumbnail generation
- Persistent caching of media metadata and thumbnails
- Windows named pipe communication for low-latency MPV control
- Support for multiple concurrent MPV player instances
- Auto-generated file IDs using SHA-256 hashing


### Mobile App (`/expo-app`)
Expo React Native application

**Tech Stack:**
- Expo 53 with file-based routing

### Structure
Key directories within `expo-app/src/`:
- `src/app`: Handles navigation and routing within the app, using file-system based routing.
- `src/components`: Contains reusable UI components used throughout the application.
- `src/hooks`: Stores custom React hooks for shared logic and state management.
- `src/lib`: Includes utility functions, API integration logic, and other shared libraries.
- `src/screens`: Contains the main screen components, representing different views of the app.
- `src/store`: Manages global application state, potentially using Zustand or a similar state management library.

## Getting Started

### Prerequisites
- **MPV player** - Must be installed and available in your system's PATH.
- **FFmpeg** - Required for thumbnail generation by the server, must be in PATH.
- **Python 3.10+** - Required for the server.
- **`uv`** - Modern Python packaging tool (install via `pip install uv`). Used for server dependency management.
- **Node.js & npm (or yarn)** - Required for Expo mobile app development.
- **Expo CLI** (optional) - Useful for running the mobile app directly (e.g., `npm install -g expo-cli` then `expo start`). Can also use `npm start` from within `expo-app`.

### Server Setup
```bash
cd mpv-remote-server
# Install dependencies using uv (reads pyproject.toml)
uv pip install .
# Run the server (defaults to port 8000)
uv run uvicorn main:app --reload
```
Server runs on `http://localhost:8000` (see `mpv-remote-server/README.md` for more details and port configuration options).

**Configuration:**
Edit `mpv-remote-server/config.py` to set up your media shares. The server uses `pydantic-settings`, so you can also use environment variables (prefixed with `MPV_REMOTE_`) or a `.env` file.
Example:
```python
# In mpv-remote-server/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    media_shares: dict[str, str] = {
        "movies": "C:/Path/To/Your/Movies",
        "tv_shows": "/mnt/user/TV_Shows",
        # Add more shares as needed (e.g., "anime": "D:/Anime")
    }
    # Other settings like media_extensions, thumbnails_dir, cache_file
    # are also available, check the actual config.py for details.
    # For example:
    # media_extensions: set[str] = {".mp4", ".mkv", ".avi"}
    # thumbnails_dir: Path = Path.cwd() / "thumbnails"

    model_config = SettingsConfigDict(
        env_file=".env", # Looks for a .env file
        env_prefix="MPV_REMOTE_", # For environment variables
    )

settings = Settings()
```

### Mobile App Setup
```bash
cd expo-app
npm install
npm start
```

## Current Status

This is a **work-in-progress** project in its very early stages.
