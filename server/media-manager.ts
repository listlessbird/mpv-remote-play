import { basename, dirname, extname, join, resolve } from "node:path"
import {
  CACHE_FILE,
  MEDIA_EXTENSIONS,
  MEDIA_SHARES,
  THUMBNAILS_DIR,
} from "./config"
import type {
  CacheData,
  MediaStats,
  ShareCache,
  ShareScanResult,
  ThumbnailQueueItem,
  Track,
} from "./types"
import { existsSync, mkdirSync, watch, type FSWatcher } from "node:fs"
import { readdir, stat } from "node:fs/promises"

class MediaManager {
  private shareCache = new Map<string, ShareCache>()
  private watchers = new Map<string, FSWatcher>()
  private thumbnailQueue = new Set<string>()
  private isProcessingThumbnails = false
  private backgroundWorkers = new Map<string, NodeJS.Immediate>()

  private thumbnailProcessor: NodeJS.Timeout | null = null

  constructor() {
    this.ensureThumbnailsDir()
    this.loadCache()
    this.startWatchers()
    this.warmCache()
    this.startThumbnailProcessing()
  }

  private ensureThumbnailsDir() {
    if (!existsSync(THUMBNAILS_DIR)) {
      mkdirSync(THUMBNAILS_DIR, { recursive: true })
    }
  }

  private async loadCache() {
    try {
      if (existsSync(CACHE_FILE)) {
        const rawData = await Bun.file(CACHE_FILE).text()
        const data: Record<string, CacheData> = JSON.parse(rawData)

        for (const [shareName, cache] of Object.entries(data)) {
          this.shareCache.set(shareName, {
            files: new Map(cache?.files || []),
            directories: new Set(cache?.directories || []),
            lastScan: new Date(cache?.lastScan || 0),
            isScanning: false,
          })
        }
        console.log(`[MediaManager] Loaded ${this.shareCache.size} shares`)
      }
    } catch (error) {
      console.error("[MediaManager] Error loading cache:", error)
    }
  }

  private async saveCache() {
    try {
      const data: Record<string, CacheData> = {}
      for (const [shareName, cache] of this.shareCache.entries()) {
        data[shareName] = {
          files: Array.from(cache.files.entries()),
          directories: Array.from(cache.directories),
          lastScan: cache.lastScan.toISOString(),
        }
      }
      await Bun.write(CACHE_FILE, JSON.stringify(data, null, 2))
      console.log("[MediaManager] Saved cache")
    } catch (error) {
      console.error("[MediaManager] Error saving cache:", error)
    }
  }

  private async startWatchers() {
    for (const [shareName, sharePath] of Object.entries(MEDIA_SHARES)) {
      if (!existsSync(sharePath)) {
        console.warn(`[MediaManager] Share path not found: ${sharePath}`)
        continue
      }

      try {
        const watcher = watch(
          sharePath,
          { recursive: true },
          (eventType, filename) => {
            if (!filename) return

            const fullPath = join(sharePath, filename)
            console.log(`[MediaManager] File ${eventType}: ${fullPath}`)

            if (eventType === "rename") {
              void this.handleFileChange(shareName, fullPath, filename)
            }
          }
        )
        this.watchers.set(shareName, watcher)
        console.log(
          `[MediaManager] Started watcher for ${shareName}: ${sharePath}`
        )
      } catch (error) {
        console.error(
          `[MediaManager] Error starting watcher for ${shareName}:`,
          error
        )
      }
    }
  }

  private async handleFileChange(
    shareName: string,
    fullPath: string,
    filename: string
  ) {
    const cache = this.shareCache.get(shareName)
    if (!cache) return

    const ext = extname(filename).toLowerCase()

    try {
      if (existsSync(fullPath)) {
        const stats = await stat(fullPath)
        if (stats.isFile() && MEDIA_EXTENSIONS.has(ext)) {
          const fileId = this.generateFileId(fullPath)
          console.log(`[MediaManager] New/modified media detected: ${filename}`)

          cache.files.delete(fileId)
          this.queueThumbnailGeneration(fullPath, fileId, filename, shareName)
        } else if (stats.isDirectory()) {
          const shareRoot = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
          const relativePath = fullPath
            .replace(shareRoot, "")
            .replace(/^[\\\/]/, "")
          cache.directories.add(relativePath)
        }
      } else {
        const possibleFileId = this.generateFileId(fullPath)
        if (cache.files.has(possibleFileId)) {
          console.log(`[MediaManager] File removed: ${filename}`)
          cache.files.delete(possibleFileId)

          const thumbPath = join(THUMBNAILS_DIR, `${possibleFileId}.jpg`)
          if (existsSync(thumbPath)) {
            await Bun.file(thumbPath).delete()
          }
        }
      }

      await this.saveCache()
    } catch (error) {
      console.error("[MediaManager] Error handling file change:", error)
    }
  }
  private async warmCache() {
    console.log("[MediaManager] Warming cache...")

    for (const [shareName] of Object.entries(MEDIA_SHARES)) {
      const sharePath = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
      if (existsSync(sharePath)) {
        this.backgroundScanShare(shareName)
      }
    }
  }

  private backgroundScanShare(shareName: string) {
    if (this.backgroundWorkers.has(shareName)) return

    const worker = this.createBackgroundScanner(shareName)
    this.backgroundWorkers.set(shareName, worker)
  }

  private createBackgroundScanner(shareName: string) {
    return setImmediate(async () => {
      try {
        console.log(`[MediaManager] Starting background scan for ${shareName}`)
        await this.scanShareInBackground(shareName)
        console.log(`[MediaManager] Background scan for ${shareName} completed`)
      } catch (error) {
        console.error(
          `[MediaManager] Error in background scan for ${shareName}:`,
          error
        )
      } finally {
        this.backgroundWorkers.delete(shareName)
      }
    })
  }

  private async scanShareInBackground(shareName: string) {
    const sharePath = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
    if (!sharePath || !existsSync(sharePath)) {
      console.error(
        `[MediaManager] Share path not found: ${sharePath} for ${shareName}`
      )
      return
    }

    let cache = this.shareCache.get(shareName)

    if (!cache) {
      cache = {
        files: new Map(),
        directories: new Set(),
        lastScan: new Date(0),
        isScanning: false,
      }
      this.shareCache.set(shareName, cache)
    }

    if (cache.isScanning) {
      console.log(`[MediaManager] Share ${shareName} is already being scanned`)
      return
    }
    cache.isScanning = true

    try {
      await this.recursiveScan(sharePath, shareName, "")
      cache.lastScan = new Date()
      await this.saveCache()
    } catch (error) {
      console.error(
        `[MediaManager] Error in background scan for ${shareName}:`,
        error
      )
    } finally {
      cache.isScanning = false
    }
  }

  private async recursiveScan(
    sharePath: string,
    shareName: string,
    relativePath: string
  ) {
    const fullPath = join(sharePath, relativePath)
    console.log(`[MediaManager] Scanning directory: ${fullPath}`)

    try {
      const entries = await readdir(fullPath, { withFileTypes: true })
      console.log(
        `[MediaManager] Found ${entries.length} entries in ${fullPath}`
      )

      const cache = this.shareCache.get(shareName)
      if (!cache) {
        console.log(`[MediaManager] No cache found for share ${shareName}`)
        return
      }

      for (const entry of entries) {
        const entryPath = join(fullPath, entry.name)
        const relativeEntryPath = join(relativePath, entry.name)

        if (entry.isDirectory()) {
          console.log(`[MediaManager] Processing directory: ${entryPath}`)
          cache.directories.add(relativeEntryPath)
          await this.recursiveScan(sharePath, shareName, relativeEntryPath)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (MEDIA_EXTENSIONS.has(ext)) {
            console.log(`[MediaManager] Processing media file: ${entryPath}`)
            const fileId = this.generateFileId(entryPath)

            if (!cache.files.has(fileId)) {
              console.log(
                `[MediaManager] Queueing thumbnail for new file: ${entryPath}`
              )
              this.queueThumbnailGeneration(
                entryPath,
                fileId,
                entry.name,
                shareName
              )
            } else {
              console.log(`[MediaManager] File already in cache: ${entryPath}`)
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `[MediaManager] Error scanning ${shareName} at ${fullPath}:`,
        error
      )
    }
  }

  private queueThumbnailGeneration(
    filePath: string,
    fileId: string,
    filename: string,
    shareName: string
  ) {
    const thumbnailPath = join(THUMBNAILS_DIR, `${fileId}.jpg`)

    if (existsSync(thumbnailPath)) {
      void this.addTrackToCache(
        filePath,
        fileId,
        filename,
        shareName,
        `/api/thumbnails/${fileId}.jpg`
      )
      return
    }

    const queueItem: ThumbnailQueueItem = {
      filePath,
      fileId,
      filename,
      shareName,
    }

    this.thumbnailQueue.add(JSON.stringify(queueItem))
  }
  private async startThumbnailProcessing() {
    this.thumbnailProcessor = setInterval(async () => {
      if (this.isProcessingThumbnails || this.thumbnailQueue.size === 0) return

      this.isProcessingThumbnails = true

      try {
        const allItems = Array.from(this.thumbnailQueue)
        this.thumbnailQueue.clear()

        console.log(`[MediaManager] Processing ${allItems.length} thumbnails`)

        const items: ThumbnailQueueItem[] = allItems.map((item) =>
          JSON.parse(item)
        )

        //process in concurrent batches of 5

        const batchSize = 5
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize)
          await Promise.all(
            batch.map((item) => this.processThumbnailItem(item))
          )
        }
      } finally {
        this.isProcessingThumbnails = false
      }
    }, 2000)
  }

  private async processThumbnailItem(item: ThumbnailQueueItem) {
    try {
      console.log(`[MediaManager] Processing thumbnail for ${item.filename})`)

      const thumbnailUrl = await this.generateThumbnail(
        item.filePath,
        item.fileId
      )

      await this.addTrackToCache(
        item.filePath,
        item.fileId,
        item.filename,
        item.shareName,
        thumbnailUrl
      )
      console.log(`[MediaManager] Successfully added ${item.filename} to cache`)
    } catch (error) {
      console.error(
        `[MediaManager] Error processing thumbnail for ${item.filename}:`,
        error
      )
    }
  }

  private async generateThumbnail(filePath: string, fileId: string) {
    const thumbnailPath = join(THUMBNAILS_DIR, `${fileId}.jpg`)
    const thumbnailUrl = `/api/thumbnails/${fileId}.jpg`

    if (existsSync(thumbnailPath)) {
      return thumbnailUrl
    }

    try {
      const duration = await this.getMediaDuration(filePath)
      const seekTime = Math.max(10, Math.floor(duration * 0.1))

      const proc = Bun.spawn(
        [
          "mpv",
          "--no-audio",
          "--vo=image",
          "--vo-image-format=jpg",
          `--vo-image-outdir=${THUMBNAILS_DIR}`,
          "--frames=1",
          `--start=${seekTime}`,
          `--screenshot-directory=${THUMBNAILS_DIR}`,
          `--screenshot-template=${fileId}`,
          "--no-terminal",
          "--quiet",
          filePath,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      )

      await proc.exited

      if (!existsSync(thumbnailPath)) {
        const generatedFiles = await readdir(THUMBNAILS_DIR)
        const possibleThumbnail = generatedFiles.find((file) =>
          file.includes(fileId)
        )

        if (possibleThumbnail) {
          const mvProc = Bun.spawn([
            "mv",
            join(THUMBNAILS_DIR, possibleThumbnail),
            thumbnailPath,
          ])
          await mvProc.exited
        }
      }

      return existsSync(thumbnailPath)
        ? thumbnailUrl
        : "/api/thumbnails/default.jpg"
    } catch (error) {
      console.error(
        `[MediaManager] Error generating thumbnail for ${filePath}:`,
        error
      )
      return "/api/thumbnails/default.jpg"
    }
  }

  private async addTrackToCache(
    filePath: string,
    fileId: string,
    filename: string,
    shareName: string,
    thumbnailUrl: string
  ) {
    const cache = this.shareCache.get(shareName)
    if (!cache) return

    const duration = await this.getMediaDuration(filePath)

    const track = {
      id: fileId,
      src: filePath,
      title: basename(filename, extname(filename)),
      thumbnail: thumbnailUrl,
      duration: Math.floor(duration),
      playlist: basename(dirname(filePath)),
    } satisfies Track

    cache.files.set(fileId, track)
  }

  private async getMediaDuration(filePath: string) {
    try {
      const proc = Bun.spawn(
        [
          "mpv",
          "--vo=null",
          "--ao=null",
          "--frames=1",
          "--no-audio",
          "--no-video",
          "--msg-level=all=no",
          "--term-playing-msg=DURATION=${duration}",
          "--idle=no",
          "--quiet",
          filePath,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      )

      const output = await new Response(proc.stdout).text()
      const durationMatch = output.match(/DURATION=(\d+.\d+)/)

      if (durationMatch?.[1]) {
        return Number.parseFloat(durationMatch[1])
      }

      const probe = Bun.spawn(
        [
          "ffprobe",
          "-v",
          "quiet",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          filePath,
        ],
        {
          stdout: "pipe",
        }
      )
      const probeOutput = await new Response(probe.stdout).text()
      return Number.parseFloat(probeOutput.trim()) || 0
    } catch (error) {
      console.error(
        `[MediaManager] Error getting media duration for ${filePath}:`,
        error
      )
      return 0
    }
  }

  async getShareFiles(
    shareName: string,
    subPath = ""
  ): Promise<ShareScanResult> {
    console.log(
      `[MediaManager:getShareFiles] Getting files for share ${shareName}${
        subPath ? ` at path ${subPath}` : ""
      }`
    )

    if (!(shareName in MEDIA_SHARES)) {
      throw new Error(`Share ${shareName} not found`)
    }

    const shareRoot = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
    if (!this.validatePath(subPath, shareRoot)) {
      throw new Error("Invalid path")
    }

    let cache = this.shareCache.get(shareName)

    if (!cache) {
      console.log(
        `[MediaManager:getShareFiles] Creating new cache for share ${shareName}`
      )
      cache = {
        files: new Map(),
        directories: new Set(),
        lastScan: new Date(0),
        isScanning: false,
      }
      this.shareCache.set(shareName, cache)
      this.backgroundScanShare(shareName)
    }

    const files: Track[] = []
    const directories: string[] = []
    console.log(`[DEBUG] Cache has ${cache?.files.size || 0} files total`)

    const requestedPath = join(shareRoot, subPath)
    console.log(`[DEBUG] Looking for files in: ${requestedPath}`)
    for (const [id, track] of cache?.files || []) {
      console.log(`[DEBUG] Cached track: ${track.title} at ${track.src}`)
    }

    for (const [, track] of cache.files.entries()) {
      const trackDir = dirname(track.src)
      console.log(`[DEBUG] Track ${track.title} is in: ${trackDir}`)

      /**
       * either i can only return the files in the requested path
       * or i can return all the files in the share and let the client filter them (this would fuck  up if the share has a lot of files)
       *
       */

      //   only return the files in the requested path
      if (trackDir === requestedPath) {
        files.push(track)
      }
    }

    for (const dir of cache.directories) {
      const parent = dirname(dir)
      if (subPath === "" && parent === ".") {
        directories.push(dir)
      } else if (parent === subPath.replace(/[\\\/]/g, "/")) {
        directories.push(basename(dir))
      }
    }

    if (files.length === 0 && directories.length === 0 && !cache.isScanning) {
      console.log(
        `[MediaManager:getShareFiles] No files found, triggering background scan for share ${shareName}`
      )
      this.backgroundScanShare(shareName)
    }

    console.log(
      `[MediaManager:getShareFiles] Found ${files.length} files and ${directories.length} directories for share ${shareName}`
    )
    return {
      files,
      directories,
      isScanning: cache.isScanning,
    }
  }

  getThumbnailPath(thumbId: string) {
    const thumbPath = join(THUMBNAILS_DIR, thumbId)
    return existsSync(thumbPath) ? thumbPath : null
  }

  getStats(): MediaStats {
    const stats = {
      shares: Object.keys(MEDIA_SHARES).length,
      totalFiles: 0,
      totalDirectories: 0,
      thumbnailQueueSize: this.thumbnailQueue.size,
      backgroundWorkers: Array.from(this.backgroundWorkers.values()).length,
      watchers: Array.from(this.watchers.values()).length,
    } satisfies MediaStats

    for (const cache of this.shareCache.values()) {
      stats.totalFiles += cache.files.size
      stats.totalDirectories += cache.directories.size
    }

    return stats
  }

  findTrackbyid(fileId: string) {
    for (const cache of this.shareCache.values()) {
      const track = cache.files.get(fileId)
      if (track) {
        return track
      }
    }
    return null
  }

  async killWatchersAndWorkers() {
    console.log("[MediaManager] Killing watchers and workers...")

    for (const watcher of this.watchers.values()) {
      watcher.close()
    }

    for (const worker of this.backgroundWorkers.values()) {
      clearImmediate(worker)
    }

    if (this.thumbnailProcessor) {
      clearInterval(this.thumbnailProcessor)
    }

    await this.saveCache()
    console.log("[MediaManager] Watchers and workers killed")
  }

  private validatePath(requestedPath: string, shareRoot: string) {
    const resolved = resolve(join(shareRoot, requestedPath))

    return resolved.startsWith(resolve(shareRoot))
  }

  private generateFileId(path: string) {
    const hash = new Bun.CryptoHasher("sha256")
    hash.update(path)
    return hash.digest("hex").substring(0, 16)
  }
}

export const mediaManager = new MediaManager()
