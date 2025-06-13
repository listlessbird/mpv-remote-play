import type {
  MPVInstance,
  MPVResponse,
  RemoteCommand,
  ServerStatus,
  Share,
  ShareContents,
} from "@/lib/api/api-types"
import { API_BASE_URL } from "@/lib/constants/constants"
import { fetch, type FetchRequestInit } from "expo/fetch"

class ApiClient {
  private baseUrl: string

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    opts?: FetchRequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers || {}),
      },
      ...opts,
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error: ${response.status} - ${errorText}`)
    }
    return response.json()
  }

  async getServerStatus(): Promise<ServerStatus> {
    return this.request<ServerStatus>("/api/status")
  }

  async getShares(): Promise<Share> {
    return this.request<Share>("/api/shares")
  }

  async getShareContents(
    shareName: string,
    path?: string
  ): Promise<ShareContents> {
    const endpoint = path
      ? `/api/shares/${shareName}/${encodeURIComponent(path)}`
      : `/api/shares/${shareName}`
    return this.request<ShareContents>(endpoint)
  }

  async getMPVInstances(): Promise<MPVInstance[]> {
    return this.request<MPVInstance[]>("/api/instances")
  }

  async createMPVInstance(mediaFile?: string) {
    return this.request<{ instanceId: string; message: string }>(
      "/api/instances",
      {
        method: "POST",
        body: JSON.stringify({ mediaFile }),
      }
    )
  }

  async sendMPVCommand(
    instanceId: string,
    command: RemoteCommand
  ): Promise<MPVResponse> {
    return this.request<MPVResponse>(`/api/instances/${instanceId}/command`, {
      method: "POST",
      body: JSON.stringify(command),
    })
  }
}

export const apiClient = new ApiClient()
