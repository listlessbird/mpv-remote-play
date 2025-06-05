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
    | "volume"
    | "mute"
    | "get_property"
    | "set_property"
  params?: Record<string, any>
}
