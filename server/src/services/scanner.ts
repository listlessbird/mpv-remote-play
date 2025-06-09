import { existsSync, watch, type FSWatcher } from "node:fs"
import type { MediaFile, ScanResult } from "../types"
import { MEDIA_EXTENSIONS, MEDIA_SHARES } from "../config"
import { extname, join } from "node:path"
import { readdir, stat } from "node:fs/promises"

export class Scanner {
  private watchers: Map<string, FSWatcher> = new Map()
  private scanning = new Set<string>()

  constructor(
    private onFileFound: (file: MediaFile) => void,
    private onFileRemoved: (filePath: string) => void,
    private onDirectoryFound: (dirPath: string, shareName: string) => void
  ) {}

  async startWatching() {
    for (const [shareName, sharePath] of Object.entries(MEDIA_SHARES)) {
      if (!existsSync(sharePath)) {
        console.error(`[Scanner] Share ${shareName} not found at ${sharePath}`)
        continue
      }
      try {
        const watcher = watch(
          sharePath,
          { recursive: true },
          (eventType, filename) => {
            if (!filename) return
            const fullPath = join(sharePath, filename)
            this.handleFileChange(shareName, fullPath, filename)
          }
        )
        this.watchers.set(shareName, watcher)
        console.log(`[Scanner] Watching ${shareName} at ${sharePath}`)
      } catch (error) {
        console.error(`[Scanner] Error watching ${shareName}: ${error}`)
      }
    }
  }

  async scanShare(shareName: string) {
    const sharePath = MEDIA_SHARES[shareName as keyof typeof MEDIA_SHARES]
    if (!sharePath || !existsSync(sharePath)) {
      throw new Error(`share path not found: ${sharePath}`)
    }

    if (this.scanning.has(shareName)) {
      return { isScanning: true, files: [], directories: [] }
    }

    this.scanning.add(shareName)

    try {
      const result = await this.recursiveScan(sharePath, shareName, "")
      return result
    } finally {
      this.scanning.delete(shareName)
    }
  }

  private async handleFileChange(
    shareName: string,
    fullPath: string,
    filename: string
  ) {
    const ext = extname(filename).toLowerCase()

    try {
      if (existsSync(fullPath)) {
        const stats = await stat(fullPath)

        if (stats.isFile() && MEDIA_EXTENSIONS.has(ext)) {
          const mediaFile = {
            id: this.generateFileId(fullPath),
            path: fullPath,
            filename,
            shareName,
            size: stats.size,
            modifiedAt: stats.mtime,
          } satisfies MediaFile

          this.onFileFound(mediaFile)
        } else if (stats.isDirectory()) {
          this.onDirectoryFound(fullPath, shareName)
        } else {
          this.onFileRemoved(fullPath)
        }
      }
    } catch (error) {
      console.error(`[Scanner] Error handling file change: ${error}`)
    }
  }

  private async recursiveScan(
    sharePath: string,
    shareName: string,
    relativePath: string
  ): Promise<ScanResult> {
    const fullPath = join(sharePath, relativePath)
    const files: MediaFile[] = []
    const directories: string[] = []

    try {
      const entries = await readdir(fullPath, { withFileTypes: true })

      for (const entry of entries) {
        const entryPath = join(fullPath, entry.name)
        const relPath = join(relativePath, entry.name)

        if (entry.isDirectory()) {
          directories.push(relPath)
          this.onDirectoryFound(entryPath, shareName)
          const subDirsIfExist = await this.recursiveScan(
            sharePath,
            shareName,
            relPath
          )
          files.push(...subDirsIfExist.files)
          directories.push(...subDirsIfExist.directories)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()

          if (MEDIA_EXTENSIONS.has(ext)) {
            const stats = await stat(entryPath)
            const mediaFile = {
              id: this.generateFileId(entryPath),
              path: entryPath,
              filename: entry.name,
              shareName,
              size: stats.size,
              modifiedAt: stats.mtime,
            } satisfies MediaFile
            files.push(mediaFile)
          }
        }
      }
    } catch (error) {
      console.error(`[Scanner] Error scanning ${fullPath}: ${error}`)
    }

    return { files, directories, isScanning: false }
  }

  private generateFileId(path: string): string {
    const hash = new Bun.CryptoHasher("sha256")
    hash.update(path)
    return hash.digest("hex").substring(0, 16)
  }

  async stop() {
    console.log("[Scanner] Stopping file system watcher")
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
    this.scanning.clear()
    console.log("[Scanner] File system watcher stopped")
  }
}
