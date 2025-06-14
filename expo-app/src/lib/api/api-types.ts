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

export interface MPVInstance {
  id: string
  status: string
  lastSeen: string
  clientName?: string
}

export interface MPVResponse {
  error?: string
  data?: any
  request_id?: number
}

export interface RemoteCommand {
  action:
    | "play"
    | "pause"
    | "stop"
    | "seek"
    | "volume"
    | "mute"
    | "get_property"
    | "set_property"
    | "loadfile"
  params?: Record<string, any>
}

export interface SeekCommand extends RemoteCommand {
  action: "seek"
  params: {
    time: number
    type?: "absolute" | "relative"
  }
}

export interface VolumeCommand extends RemoteCommand {
  action: "volume"
  params: {
    level: number
  }
}

export interface GetPropertyCommand extends RemoteCommand {
  action: "get_property"
  params: {
    property: string
  }
}

export interface SetPropertyCommand extends RemoteCommand {
  action: "set_property"
  params: {
    property: string
    value: any
  }
}

export interface TrackInfo {
  id: number
  title: string
  lang: string
  codec: string
  default: boolean
  selected: boolean
}

export interface TracksResponse {
  /**
   * 
   * {
	"audioTracks": [
		{
			"id": 1,
			"title": "Audio 1",
			"lang": "eng",
			"codec": "aac",
			"default": true,
			"selected": true
		}
	],
	"subtitleTracks": [],
	"audioTrack": 1,
	"subtitleTrack": false
}
   * 
   */
  audioTracks: TrackInfo[]
  subtitleTracks: TrackInfo[]

  // current tracks
  audioTrack: TrackInfo
  subtitleTrack: TrackInfo | boolean
}
