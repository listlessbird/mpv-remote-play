```markdown
# MPV Remote Server

This server is a Python application built with FastAPI. It manages MPV player instances, serves media files from configured shares, and provides an API for a remote client (like the `expo-app`) to interact with.

## Key Features

- Control MPV instances (play, pause, stop, load files, etc.).
- Browse media libraries from configured shares.
- Automatic scanning of media shares for new files (via `services/scanner.py` triggered by `services/shares.py`).
- Thumbnail generation for video files.
- Real-time status updates for MPV instances.

## Project Structure

- **`main.py`**: The main FastAPI application file, defining API endpoints and application lifecycle events (startup/shutdown for share service).
- **`config.py`**: Handles application settings, including media share paths, supported media extensions, thumbnail directory, and cache file location. Settings are loaded from environment variables or a `.env` file.
- **`run.py`**: A utility script to start the development server using `uvicorn main:app --host 127.0.0.1 --port 8000 --reload`. The primary command for running the server is `uvicorn main:app`.
- **`services/`**: Contains the core logic of the server:
    - **`mpv_manager.py`**: Manages MPV player instances, including creation, termination, and command execution via IPC (Inter-Process Communication, likely using Windows named pipes as hinted in the main project README).
    - **`shares.py`**: Handles the logic for accessing and managing media shares, including file listings, metadata, and initialization of the media scanner.
    - **`scanner.py`**: Scans the configured media directories to discover and cache media files.
    - **`thumbnails.py`**: Responsible for generating and caching thumbnails for video files using Pillow, likely after extraction with a tool like FFmpeg.
    - **`cache.py`**: Provides caching mechanisms for media metadata and thumbnails (as suggested by `config.py`'s `cache_file` setting).
- **`models/`**: Defines Pydantic models for data validation and serialization (e.g., API request/response bodies like `RemoteCommand`, `Track`).

## API Endpoints

The server exposes the following primary API endpoints (defined in `main.py`):

- **GET `/api/status`**: Returns the current status of the server, timestamp, and media share statistics.
- **GET `/api/instances`**: Lists all active MPV instances with their ID, status, last seen time, and client name.
- **POST `/api/instances`**: Creates a new MPV instance. Can optionally take a `mediaFile` in the request body to start playback immediately. It may reuse an existing running instance.
- **GET `/api/instances/{instance_id}`**: Retrieves details for a specific MPV instance.
- **DELETE `/api/instances/{instance_id}`**: Stops and removes a specific MPV instance.
- **POST `/api/instances/{instance_id}/command`**: Sends a command (defined by `RemoteCommand` model) to a specific MPV instance.
- **GET `/api/instances/{instance_id}/tracks`**: Gets available audio and subtitle tracks, and current selections for the playing media in an instance.
- **POST `/api/instances/{instance_id}/tracks`**: Sets the active audio or subtitle track for an instance. Expects `type` ('audio' or 'subtitle') and `trackId`.
- **GET `/api/shares`**: Lists the names of the configured media shares.
- **GET `/api/shares/{share}`**: Retrieves the content (files and directories) of the root of a specific share.
- **GET `/api/shares/{share}/{path:path}`**: Retrieves the content of a specific path within a share.
- **GET `/api/thumbnails/{thumbnail_id}`**: Serves the thumbnail image (JPEG) for the given ID. The ID should be the filename without the `.jpg` extension.

## Setup and Running

1.  **Prerequisites**:
    *   Python 3.10+
    *   MPV player installed and accessible in your system's PATH.
    *   FFmpeg installed and accessible in your system's PATH (for thumbnail generation, although `thumbnails.py` itself might use Pillow for manipulation after FFmpeg extraction).
    *   `uv` (Python packaging tool, install via `pip install uv`).

2.  **Installation**:
    Navigate to the `mpv-remote-server` directory:
    ```bash
    cd mpv-remote-server
    ```
    Install dependencies from `pyproject.toml` using `uv`:
    ```bash
    uv pip install .
    ```
    *(Optional: To generate a `requirements.txt` for other purposes after installation, you can run `uv pip freeze > requirements.txt`)*

3.  **Configuration**:
    Edit `config.py` to set up your media shares and other settings. The configuration is managed by `pydantic-settings` and can also be set via environment variables (prefixed with `MPV_REMOTE_`) or a `.env` file.
    Example `config.py` structure:
    ```python
    from pathlib import Path
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class Settings(BaseSettings):
        media_extensions: set[str] = {".mp4", ".mkv", ".avi"} # Customize your media file extensions
        thumbnails_dir: Path = Path.cwd() / "thumbnails"    # Directory to store thumbnails
        cache_file: Path = Path.cwd() / "media-cache.json" # File for media cache
        media_shares: dict[str, str] = {
            "movies": "C:/Path/To/Your/Movies",
            "tv_shows": "/mnt/user/TV_Shows",
            # Add more shares as needed
            # "anime": "E:/Anime"
        }

        model_config = SettingsConfigDict(
            env_file=".env",
            env_prefix="MPV_REMOTE_", # e.g., MPV_REMOTE_MEDIA_SHARES='{"movies": "/path"}'
        )

    settings = Settings()
    ```

4.  **Running the server**:
    To run the server using Uvicorn (as specified in `pyproject.toml`'s `fastapi[standard]` which includes uvicorn):
    ```bash
    uv run uvicorn main:app --reload --port 8000
    ```
    Or, you can use the `run.py` script:
    ```bash
    python run.py
    ```
    This will also start the server on `http://localhost:8000`.

    **Note on Port Consistency**: The main project `README.md` refers to the server running on port 3000. This server configuration defaults to port 8000. For consistency, you might want to either update the main `README.md` or change the port here using `uvicorn main:app --reload --port 3000`.

```
