import { existsSync } from "node:fs"
import type { CacheData, MediaFile, ShareCache, Track } from "../types"
import { CACHE_FILE, MEDIA_SHARES } from "../config"
import {
  basename,
  dirname,
  extname,
  join,
  normalize,
  relative,
} from "node:path"

export class MediaCache {
  private shareCache = new Map<string, ShareCache>()

  async load() {
    try {
      if (existsSync(CACHE_FILE)) {
        const raw = await Bun.file(CACHE_FILE).text()
        const data: Record<string, CacheData> = JSON.parse(raw)

        for (const [shareName, shareData] of Object.entries(data)) {
          this.shareCache.set(shareName, {
            files: new Map(shareData.files || []),
            directories: new Set(shareData.directories || []),
            lastScan: new Date(shareData.lastScan || Date.now()),
          })
        }
        console.log(
          `[MediaCache] Loaded ${this.shareCache.size} shares from cache`
        )
      }
    } catch (error) {
      console.error(`[MediaCache] Error loading cache: ${error}`)
    }
  }

  async save() {
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
    } catch (error) {
      console.error("[MediaCache] Error saving cache:", error)
    }
  }

  addOrUpdateTrack(
    mediaFile: MediaFile,
    thumbnailUrl?: string,
    duration?: number
  ) {
    let cache = this.shareCache.get(mediaFile.shareName)
    if (!cache) {
      cache = {
        files: new Map(),
        directories: new Set(),
        lastScan: new Date(),
      }
      this.shareCache.set(mediaFile.shareName, cache)
    }

    const track: Track = {
      id: mediaFile.id,
      src: mediaFile.path,
      title: basename(mediaFile.filename, extname(mediaFile.filename)),
      thumbnail: thumbnailUrl || "/api/thumbnails/default.jpg",
      duration: duration || 0,
      playlist: basename(dirname(mediaFile.path)),
    }

    cache.files.set(mediaFile.id, track)
  }

  addDirectory(dirPath: string, shareName: string) {
    let cache = this.shareCache.get(shareName)

    if (!cache) {
      cache = {
        files: new Map(),
        directories: new Set(),
        lastScan: new Date(),
      }
      this.shareCache.set(shareName, cache)
    }

    const shareRoot = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
    if (shareRoot) {
      const relativePath = relative(shareRoot, dirPath).replace(/\\/g, "/")
      if (relativePath && relativePath !== ".") {
        cache.directories.add(relativePath)
      }
    }
  }

  removeTrack(fileId: string, shareName: string) {
    const cache = this.shareCache.get(shareName)
    if (cache) {
      cache.files.delete(fileId)
    }
  }

  getShareFiles(
    shareName: string,
    subPath = ""
  ): { files: Track[]; directories: string[] } {
    const cache = this.shareCache.get(shareName)
    if (!cache) {
      return { files: [], directories: [] }
    }

    const shareRoot = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
    if (!shareRoot) {
      return { files: [], directories: [] }
    }

    const files: Track[] = []
    const directories: string[] = []

    const normalizedSubPath = subPath.replace(/\\/g, "/").trim()
    const targetPath = normalizedSubPath
      ? join(shareRoot, normalizedSubPath)
      : shareRoot

    for (const track of cache.files.values()) {
      const trackDir = dirname(track.src)
      const normalizedTrackDir = normalize(trackDir).replace(/\\/g, "/")
      const normalizedTargetPath = normalize(targetPath).replace(/\\/g, "/")

      if (normalizedTrackDir === normalizedTargetPath) {
        files.push(track)
      }
    }

    const pathDepth = normalizedSubPath
      ? normalizedSubPath.split("/").length
      : 0

    for (const dir of cache.directories) {
      const dirPaths = dir.split("/")

      if (normalizedSubPath === "") {
        if (dirPaths.length === 1) {
          // @ts-ignore
          directories.push(dirPaths[0])
        }
      } else {
        const subPathParts = normalizedSubPath.split("/")
        if (
          dirPaths.length === subPathParts.length + 1 &&
          dirPaths.slice(0, subPathParts.length).join("/") === normalizedSubPath
        ) {
          // @ts-ignore
          directories.push(dirPaths[subPathParts.length])
        }
      }
    }

    return {
      files: files.sort((a, b) => a.title.localeCompare(b.title)),
      directories: [...new Set(directories)].sort(),
    }
  }

  findTrackById(fileId: string): Track | null {
    for (const cache of this.shareCache.values()) {
      const track = cache.files.get(fileId)
      if (track) return track
    }
    return null
  }

  getStats() {
    let totalFiles = 0
    let totalDirectories = 0

    for (const cache of this.shareCache.values()) {
      totalFiles += cache.files.size
      totalDirectories += cache.directories.size
    }

    return { totalFiles, totalDirectories }
  }
}
