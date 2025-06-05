export interface MPVInstance {
  id: string
  pipeName: string
  status: "starting" | "running" | "error" | "stopped"
  process?: any
  lastSeen: Date
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
