export interface MPVInstance {
  id: string
  pipeName: string
  status: "starting" | "running" | "error" | "stopped"
  process?: any
  lastSeen: Date
  clientName?: string
}

export interface MPVCommand {
  command: string[]
  request_id?: string
  async?: boolean
}

export interface MPVResponse {
  error: string
  data?: any
  request_id?: number
}

export interface RemoteCommand {
  action:
    | "play"
    | "pause"
    | "stop"
    | "seek"
    | "loadfile"
    | "volume"
    | "mute"
    | "get_property"
    | "set_property"
  params?: Record<string, any>
}

export interface Track {
  id: string
  src: string
  title: string
  thumbnail: string
  duration: number
  playlist?: string
}

export interface ShareCache {
  files: Map<string, Track>
  directories: Set<string>
  lastScan: Date
}

export interface CacheData {
  files: [string, Track][]
  directories: string[]
  lastScan: string
}

export interface ThumbnailQueueItem {
  filePath: string
  fileId: string
  filename: string
  shareName: string
}

export interface ShareScanResult {
  files: Track[]
  directories: string[]
  isScanning: boolean
}

export interface MediaStats {
  shares: number
  totalFiles: number
  totalDirectories: number
  thumbnailQueueSize: number
  backgroundWorkers: number
  watchers: number
}

export interface MediaFile {
  id: string
  path: string
  filename: string
  shareName: string
  size: number
  modifiedAt: Date
}

export interface ScanResult {
  files: MediaFile[]
  directories: string[]
  isScanning: boolean
}

export interface ThumbnailResult {
  success: boolean
  fileId: string
  path?: string
  url?: string
  error?: string
}
