import path from "node:path"

export const MEDIA_EXTENSIONS = new Set([".mp4", ".mkv", ".mp3", ".flac"])
export const THUMBNAILS_DIR = path.join(process.cwd(), "thumbnails")

export const CACHE_FILE = path.join(process.cwd(), "media-cache.json")

export const MEDIA_SHARES = {
  media: "E:/dls/cdrama",
} as const
