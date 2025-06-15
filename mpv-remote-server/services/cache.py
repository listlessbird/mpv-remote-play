import json
from pathlib import Path
from typing import Dict, Set, Optional, Tuple, List
from datetime import datetime

from models.model import CacheData, MediaFile, ShareCache, Track
from config import settings


class MediaCache:
    def __init__(self):
        self.share_cache: Dict[str, ShareCache] = {}

    async def load(self):
        try:
            if settings.cache_file.exists():
                with open(settings.cache_file, "r") as f:
                    data = json.load(f)

                for share_name, share_data in data.items():
                    files_dict = {
                        file_id: Track(**track_data)
                        for file_id, track_data in share_data.get("files", [])
                    }

                    self.share_cache[share_name] = ShareCache(
                        files=files_dict,
                        directories=share_data.get("directories", []),
                        lastScan=datetime.fromisoformat(
                            share_data.get("lastScan", datetime.now().isoformat())
                        ),
                    )

                print(f"[MediaCache] Loaded {len(self.share_cache)} shares from cache")
        except Exception as error:
            print(f"[MediaCache] Error loading cache: {error}")

    async def save(self):
        try:
            data = {}
            for share_name, cache in self.share_cache.items():
                data[share_name] = {
                    "files": [
                        [file_id, track.dict()]
                        for file_id, track in cache.files.items()
                    ],
                    "directories": cache.directories,
                    "lastScan": cache.last_scan.isoformat(),
                }

            with open(settings.cache_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as error:
            print(f"[MediaCache] Error saving cache: {error}")

    def add_or_update_track(
        self,
        media_file: MediaFile,
        thumbnail_url: Optional[str] = None,
        duration: Optional[float] = None,
    ):
        cache = self.share_cache.get(media_file.share_name)
        if not cache:
            cache = ShareCache(files={}, directories=[], lastScan=datetime.now())
            self.share_cache[media_file.share_name] = cache

        track = Track(
            id=media_file.id,
            src=media_file.path,
            title=Path(media_file.filename).stem,
            thumbnail=thumbnail_url or "/api/thumbnails/default.jpg",
            duration=duration or 0,
            playlist=Path(media_file.path).parent.name,
        )

        cache.files[media_file.id] = track

    def add_directory(self, dir_path: str, share_name: str):
        cache = self.share_cache.get(share_name)

        if not cache:
            cache = ShareCache(files={}, directories=[], lastScan=datetime.now())
            self.share_cache[share_name] = cache

        share_root = settings.media_shares.get(share_name)
        if share_root:
            relative_path = Path(dir_path).relative_to(share_root).as_posix()
            if relative_path and relative_path != ".":
                cache.directories.append(relative_path)

    def remove_track(self, file_id: str, share_name: str):
        cache = self.share_cache.get(share_name)
        if cache and file_id in cache.files:
            del cache.files[file_id]

    def get_share_files(
        self, share_name: str, sub_path: str = ""
    ) -> Tuple[List[Track], List[str]]:
        cache = self.share_cache.get(share_name)
        if not cache:
            return [], []

        share_root = settings.media_shares.get(share_name)
        if not share_root:
            return [], []

        files: List[Track] = []
        directories: List[str] = []

        normalized_sub_path = sub_path.replace("\\", "/").strip()
        target_path = (
            Path(share_root) / normalized_sub_path
            if normalized_sub_path
            else Path(share_root)
        )

        for track in cache.files.values():
            track_dir = Path(track.src).parent
            if track_dir == target_path:
                files.append(track)

        path_depth = len(normalized_sub_path.split("/")) if normalized_sub_path else 0

        for dir_path in cache.directories:
            dir_parts = dir_path.split("/")

            if normalized_sub_path == "":
                if len(dir_parts) == 1:
                    directories.append(dir_parts[0])
            else:
                sub_path_parts = normalized_sub_path.split("/")
                if (
                    len(dir_parts) == len(sub_path_parts) + 1
                    and "/".join(dir_parts[: len(sub_path_parts)])
                    == normalized_sub_path
                ):
                    directories.append(dir_parts[len(sub_path_parts)])

        return (sorted(files, key=lambda x: x.title), sorted(list(set(directories))))

    def find_track_by_id(self, file_id: str) -> Optional[Track]:
        for cache in self.share_cache.values():
            if file_id in cache.files:
                return cache.files[file_id]
        return None

    def get_stats(self) -> Tuple[int, int]:
        total_files = 0
        total_directories = 0

        for cache in self.share_cache.values():
            total_files += len(cache.files)
            total_directories += len(cache.directories)

        return total_files, total_directories


media_cache = MediaCache()
