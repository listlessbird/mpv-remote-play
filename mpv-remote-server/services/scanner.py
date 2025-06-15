import asyncio
from datetime import datetime
from pathlib import Path
from watchdog.observers import Observer
from watchdog.observers.api import BaseObserver
from watchdog.events import FileSystemEventHandler, FileSystemEvent
import hashlib
from typing import Callable, Set, Dict, List, Awaitable

import watchdog.observers
import watchdog.observers.api

from models.model import MediaFile, ScanResult
from config import settings


class ScannerEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        share_name: str,
        on_file_found: Callable,
        on_file_removed: Callable,
        on_directory_found: Callable,
    ):
        self.share_name = share_name
        self.on_file_found = on_file_found
        self.on_file_removed = on_file_removed
        self.on_directory_found = on_directory_found

        self.loop = asyncio.get_event_loop()

        async def _handle_file_found(self, path: Path):
            stat = path.stat()

            media_file = MediaFile(
                id=self.generate_file_id(path),
                path=str(path),
                filename=path.name,
                shareName=self.share_name,
                size=stat.st_size,
                modifiedAt=datetime.fromtimestamp(stat.st_mtime),
            )

            await self.on_file_found(media_file)

        def generate_file_id(self, path: Path) -> str:
            return hashlib.sha256(str(path).encode()).hexdigest()[:16]

        async def on_any_event(self, event: FileSystemEvent):
            if event.is_directory:
                return

            path = Path(str(event.src_path))

            if path.suffix.lower() in settings.media_extensions:
                if event.event_type in ["created", "modified"]:
                    asyncio.run_coroutine_threadsafe(
                        self._handle_file_found(path),
                        self.loop,
                    )

                elif event.event_type == "deleted":
                    asyncio.run_coroutine_threadsafe(
                        self.on_file_removed(str(path)),
                        self.loop,
                    )


class Scanner:
    def __init__(
        self,
        on_file_found: Callable[[MediaFile], Awaitable[None]],
        on_file_removed: Callable[[str], Awaitable[None]],
        on_directory_found: Callable[[str, str], Awaitable[None]],
    ):
        self.on_file_found = on_file_found
        self.on_file_removed = on_file_removed
        self.on_directory_found = on_directory_found
        self.watchers: Dict[str, BaseObserver] = {}
        self.scanning: Set[str] = set()

    async def start_watching(self):
        for share_name, share_path in settings.media_shares.items():
            path = Path(share_path)
            if not path.exists():
                print(f"[Scanner] Share path {share_path} does not exist")
                continue

            try:
                observer = Observer()
                handler = ScannerEventHandler(
                    share_name,
                    self.on_file_found,
                    self.on_file_removed,
                    self.on_directory_found,
                )

                observer.schedule(handler, str(path), recursive=True)
                observer.start()
                self.watchers[share_name] = observer
                print(f"[Scanner] Watching {share_name} at {share_path}")
            except Exception as e:
                print(f"[Scanner] Failed watching {share_path}: {e}")

    async def scan_share(self, share_name: str) -> ScanResult:
        share_path = settings.media_shares.get(share_name)
        if not share_path or not Path(share_path).exists():
            raise ValueError(
                f"Share path for {share_name} does not exist: {share_path}"
            )

        if share_name in self.scanning:
            return ScanResult(
                files=[],
                directories=[],
                isScanning=True,
            )

        self.scanning.add(share_name)

        try:
            result = await self.recursive_scan(share_path, share_name, "")
            return result
        finally:
            self.scanning.discard(share_name)

    async def recursive_scan(
        self,
        share_path: str,
        share_name: str,
        relative_path: str,
    ) -> ScanResult:
        full_path = Path(share_path) / relative_path
        files: List[MediaFile] = []
        directories: List[str] = []

        try:
            for entry in full_path.iterdir():
                entry_rel_path = str(Path(relative_path) / entry.name)

                if entry.is_dir():
                    directories.append(entry_rel_path)
                    await self.on_directory_found(str(entry), share_name)

                    sub_result = await self.recursive_scan(
                        share_path,
                        share_name,
                        entry_rel_path,
                    )
                    files.extend(sub_result.files)
                    directories.extend(sub_result.directories)

                elif entry.is_file():
                    if entry.suffix.lower() in settings.media_extensions:
                        stat = entry.stat()
                        media_file = MediaFile(
                            id=self.generate_file_id(entry),
                            path=str(entry),
                            filename=entry.name,
                            shareName=share_name,
                            size=stat.st_size,
                            modifiedAt=datetime.fromtimestamp(stat.st_mtime),
                        )
                        files.append(media_file)
                        await self.on_file_found(media_file)

        except Exception as e:
            print(f"[Scanner] Error scanning {full_path}: {e}")

        return ScanResult(
            files=files,
            directories=directories,
            isScanning=False,
        )

    def generate_file_id(self, path: Path) -> str:
        return hashlib.sha256(str(path).encode()).hexdigest()[:16]

    async def stop(self):
        print("[Scanner] Stopping file system watcher")
        for observer in self.watchers.values():
            observer.stop()
            observer.join()
        self.watchers.clear()
        self.scanning.clear()
        print("[Scanner] File system watcher stopped")
