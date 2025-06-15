from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    media_extensions: set[str] = {
        ".mp4",
        ".mkv",
    }
    thumbnails_dir: Path = Path.cwd() / "thumbnails"
    cache_file: Path = Path.cwd() / "media-cache.json"
    media_shares: dict[str, str] = {"media": "E:/dls/cdrama"}

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MPV_REMOTE_",
    )


settings = Settings()
