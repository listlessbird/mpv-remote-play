import { join, basename, extname } from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { THUMBNAILS_DIR } from "../config"
import type { MediaFile, ThumbnailResult } from "../types"
import PQueue from "p-queue"
export class ThumbnailGenerator {
  private queue: PQueue
  private isShuttingDown = false
  private processingCache = new Map<string, Promise<ThumbnailResult>>()

  constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      timeout: 30 * 1000,
      throwOnTimeout: true,
    })
    this.ensureThumbnailsDir()
  }

  private ensureThumbnailsDir() {
    if (!existsSync(THUMBNAILS_DIR)) {
      mkdirSync(THUMBNAILS_DIR, { recursive: true })
    }
  }

  async generateThumbnail(mediaFile: MediaFile): Promise<ThumbnailResult> {
    if (this.isShuttingDown) {
      throw new Error("Cannot generate thumbnail: Server is shutting down")
    }

    const existing = this.processingCache.get(mediaFile.id)
    if (existing) {
      return existing
    }

    const newPromise = this.doGenerateThumbnail(mediaFile)
    this.processingCache.set(mediaFile.id, newPromise)

    try {
      const result = await newPromise
      return result
    } finally {
      this.processingCache.delete(mediaFile.id)
    }
  }

  queueThumbnail(mediaFile: MediaFile) {
    if (this.isShuttingDown) return
    const existing = this.processingCache.get(mediaFile.id)
    if (existing) return

    const promise = this.queue.add(() => this.doGenerateThumbnail(mediaFile), {
      priority: 0,
    })

    this.processingCache.set(mediaFile.id, promise)
    promise
      .then((result) => {
        if (result) {
          if (result?.success) {
            console.log(
              `[ThumbnailService] Thumbnail generated for ${mediaFile.filename}`
            )
          } else {
            console.error(
              `[ThumbnailService] Failed to generate thumbnail for ${mediaFile.filename}: ${result.error}`
            )
          }
        }
      })
      .catch((error) => {
        console.error(
          `[ThumbnailService] Background thumbnail generation failed for ${mediaFile.filename}:`,
          error
        )
      })
      .finally(() => {
        this.processingCache.delete(mediaFile.id)
      })
  }

  private async doGenerateThumbnail(
    mediaFile: MediaFile
  ): Promise<ThumbnailResult> {
    const thumbPath = join(THUMBNAILS_DIR, `${mediaFile.id}.jpg`)
    const url = `/api/thumbnails/${mediaFile.id}.jpg`

    console.log(
      `[ThumbnailService] Starting thumbnail generation for ${mediaFile.filename}`
    )

    if (existsSync(thumbPath)) {
      return {
        success: true,
        path: thumbPath,
        url,
        fileId: mediaFile.id,
      }
    }

    try {
      const duration = await this.getMediaDuration(mediaFile.path)
      const seekTime = Math.max(10, Math.floor(duration * 0.1))

      const ffmpegArgs = [
        "ffmpeg",
        "-ss",
        seekTime.toString(),
        "-i",
        mediaFile.path,
        "-vframes",
        "1",
        "-q:v",
        "2",
        "-y",
        thumbPath,
      ]

      console.log(
        `[ThumbnailService] Running ffmpeg command: ${ffmpegArgs.join(" ")}`
      )

      const proc = Bun.spawn(ffmpegArgs, {
        stdout: "pipe",
        stderr: "pipe",
      })

      const result = await proc.exited

      //   if (proc.stderr) {
      //     const stderr = await new Response(proc.stderr).text()
      //     if (stderr.trim()) {
      //       console.log(`[ThumbnailService] ffmpeg stderr: ${stderr}`)
      //     }
      //   }

      const finalExists = existsSync(thumbPath)

      return finalExists
        ? {
            success: true,
            path: thumbPath,
            url,
            fileId: mediaFile.id,
          }
        : {
            success: false,
            error: "Failed to generate thumbnail",
            fileId: mediaFile.id,
          }
    } catch (error) {
      console.error(
        `[ThumbnailService] Error generating thumbnail for ${mediaFile.path}:`,
        error
      )
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        fileId: mediaFile.id,
      }
    }
  }

  async getMediaDuration(filePath: string): Promise<number> {
    try {
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
        { stdout: "pipe" }
      )

      const output = await new Response(probe.stdout).text()
      return Number.parseFloat(output.trim()) || 0
    } catch (error) {
      console.error(
        `[ThumbnailService] Error getting duration for ${filePath}:`,
        error
      )
      return 0
    }
  }

  getThumbnailPath(fileId: string): string | null {
    const thumbnailPath = join(THUMBNAILS_DIR, `${fileId}.jpg`)
    return existsSync(thumbnailPath) ? thumbnailPath : null
  }

  get queueSize(): number {
    return this.queue.size + this.queue.pending
  }

  get isPaused(): boolean {
    return this.queue.isPaused
  }

  pause(): void {
    this.queue.pause()
  }

  start(): void {
    this.queue.start()
  }

  async shutdown() {
    this.isShuttingDown = true
    this.queue.pause()
    await this.queue.onIdle()
    this.queue.clear()
    this.processingCache.clear()
  }
}
