export interface Track {
  id: string
  src: string
  title: string
  thumbnail: string
  duration: number
  playlist?: string
}

export interface Share {
  shares: string[]
}

export interface ShareContents {
  files: Track[]
  directories: string[]
  path: string
  isScanning: boolean
}

export interface ServerStatus {
  status: string
  timestamp: string
  stats: {
    shares: number
    totalFiles: number
    totalDirectories: number
    thumbnailQueueSize: number
    backgroundWorkers: number
    watchers: number
  }
}
