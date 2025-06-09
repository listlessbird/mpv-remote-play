import { Scanner } from "./scanner"
import { ThumbnailGenerator } from "./thumbnails"
import { MediaCache } from "./cache"
import type { ShareScanResult, MediaStats, MediaFile } from "../types"
import { MEDIA_SHARES } from "../config"

export class MediaShare {
  private scanner: Scanner
  private thumbnailGenerator: ThumbnailGenerator
  private cache: MediaCache

  constructor() {
    this.scanner = new Scanner(
      (file) => this.handleFileFound(file),
      (filePath) => this.handleFileRemoved(filePath),
      (dirPath, shareName) => this.handleDirectoryFound(dirPath, shareName)
    )
    this.thumbnailGenerator = new ThumbnailGenerator()
    this.cache = new MediaCache()
  }

  async init() {
    await this.cache.load()
    await this.scanner.startWatching()

    for (const shareName of Object.keys(MEDIA_SHARES)) {
      setImmediate(() => this.backgroundScan(shareName))
    }
  }

  async getShareFiles(
    shareName: string,
    subPath = ""
  ): Promise<ShareScanResult> {
    if (!(shareName in MEDIA_SHARES)) {
      throw new Error(`Share ${shareName} not found`)
    }

    const { files, directories } = this.cache.getShareFiles(shareName, subPath)

    return {
      files,
      directories,
      isScanning: false,
    }
  }

  getStats(): MediaStats {
    const cacheStats = this.cache.getStats()
    return {
      shares: Object.keys(MEDIA_SHARES).length,
      totalFiles: cacheStats.totalFiles,
      totalDirectories: cacheStats.totalDirectories,
      thumbnailQueueSize: 0,
      backgroundWorkers: 0,
      watchers: 1,
    }
  }

  findTrackById(fileId: string) {
    return this.cache.findTrackById(fileId)
  }

  getThumbnailPath(thumbId: string) {
    return this.thumbnailGenerator.getThumbnailPath(thumbId)
  }

  private async handleFileFound(file: MediaFile) {
    console.log(`[MediaShare] File found: ${file.path}`)

    this.cache.addOrUpdateTrack(file)
    await this.cache.save()

    setImmediate(async () => {
      try {
        const duration = await this.thumbnailGenerator.getMediaDuration(
          file.path
        )
        const thumb = await this.thumbnailGenerator.generateThumbnail(file)

        if (thumb.success) {
          this.cache.addOrUpdateTrack(file, thumb.url, duration)
          await this.cache.save()
        }
      } catch (error) {
        console.error(
          `[MediaShare] Error processing file ${file.filename}: ${error}`
        )
      }
    })
  }

  private async handleFileRemoved(filePath: string) {
    console.log(`[MediaShare] File removed: ${filePath}`)
  }

  private async handleDirectoryFound(dirPath: string, shareName: string) {
    console.log(`[MediaShare] Directory found: ${dirPath} in ${shareName}`)
    this.cache.addDirectory(dirPath, shareName)
    await this.cache.save()
  }

  private async backgroundScan(shareName: string) {
    try {
      console.log(`[MediaShare] Starting background scan for ${shareName}`)
      const result = await this.scanner.scanShare(shareName)

      for (const file of result.files) {
        await this.handleFileFound(file)
      }
      console.log(`[MediaShare] Background scan for ${shareName} completed`)
    } catch (error) {
      console.error(
        `[MediaShare] Error during background scan for ${shareName}: ${error}`
      )
    }
  }

  async shutdown() {
    await this.scanner.stop()
    await this.thumbnailGenerator.shutdown()
    await this.cache.save()
  }
}
