import asyncio
from typing import Set

from services.scanner import Scanner
from services.thumbnails import ThumbnailGenerator
from services.cache import MediaCache
from models.model import ShareScanResult, MediaStats, MediaFile
from config import settings


class MediaShare:
    def __init__(self):
        self.scanner = Scanner(
            self.handle_file_found,
            self.handle_file_removed,
            self.handle_directory_found,
        )
        self.thumbnail_generator = ThumbnailGenerator()
        self.cache = MediaCache()
        self.processed_files: Set[str] = set()

    async def init(self):
        await self.cache.load()
        await self.thumbnail_generator.start()
        await self.scanner.start_watching()

        for share_name in settings.media_shares.keys():
            asyncio.create_task(self.background_scan(share_name))

    async def get_share_files(
        self, share_name: str, sub_path: str = ""
    ) -> ShareScanResult:
        if share_name not in settings.media_shares:
            raise ValueError(f"Share {share_name} not found")

        files, directories = self.cache.get_share_files(share_name, sub_path)

        return ShareScanResult(files=files, directories=directories, isScanning=False)

    def get_stats(self) -> MediaStats:
        total_files, total_directories = self.cache.get_stats()
        return MediaStats(
            shares=len(settings.media_shares),
            totalFiles=total_files,
            totalDirectories=total_directories,
            thumbnailQueueSize=self.thumbnail_generator.queue_size,
            backgroundWorkers=0,
            watchers=1,
        )

    def find_track_by_id(self, file_id: str):
        return self.cache.find_track_by_id(file_id)

    def get_thumbnail_path(self, thumb_id: str):
        return self.thumbnail_generator.get_thumbnail_path(thumb_id)

    async def handle_file_found(self, file: MediaFile):
        if file.id in self.processed_files:
            return

        self.processed_files.add(file.id)

        print(f"[MediaShare] File found: {file.path}")

        self.cache.add_or_update_track(file)
        await self.cache.save()
        self.thumbnail_generator.queue_thumbnail(file)

    async def handle_file_removed(self, file_path: str):
        print(f"[MediaShare] File removed: {file_path}")

    async def handle_directory_found(self, dir_path: str, share_name: str):
        print(f"[MediaShare] Directory found: {dir_path} in {share_name}")
        self.cache.add_directory(dir_path, share_name)
        await self.cache.save()

    async def background_scan(self, share_name: str):
        try:
            print(f"[MediaShare] Starting background scan for {share_name}")
            result = await self.scanner.scan_share(share_name)

            processed_count = 0
            for file in result.files:
                await self.handle_file_found(file)
                processed_count += 1

                if processed_count % 10 == 0:
                    print(
                        f"[MediaShare] Background scan for share '{share_name}' processed {processed_count}/{len(result.files)} files"
                    )

            print(
                f"[MediaShare] Background scan for share '{share_name}' completed. Processed {processed_count} files"
            )
        except Exception as error:
            print(
                f"[MediaShare] Error during background scan for {share_name}: {error}"
            )

    async def shutdown(self):
        await self.scanner.stop()
        await self.thumbnail_generator.shutdown()
        await self.cache.save()
