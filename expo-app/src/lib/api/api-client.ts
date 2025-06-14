import type {
  MPVInstance,
  MPVResponse,
  RemoteCommand,
  ServerStatus,
  Share,
  ShareContents,
  TracksResponse,
} from "@/lib/api/api-types"
import { API_BASE_URL } from "@/lib/constants/constants"
import { fetch, type FetchRequestInit } from "expo/fetch"
import { useSettingsStore } from "@/store/settings"

class ApiClient {
  private get baseUrl() {
    return useSettingsStore.getState().connection.serverUrl
  }

  private get timeout() {
    return useSettingsStore.getState().connection.connectionTimeout
  }

  private async request<T>(
    endpoint: string,
    opts?: FetchRequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...(opts?.headers || {}),
        },
        signal: controller.signal,
        ...opts,
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      return response.json()
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out")
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
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

  async getTracks(instanceId: string): Promise<TracksResponse> {
    return this.request<TracksResponse>(`/api/instances/${instanceId}/tracks`)
  }

  async setTrack(
    instanceId: string,
    type: "audio" | "subtitle",
    trackId: number
  ) {
    return this.request<{ message: string }>(
      `/api/instances/${instanceId}/tracks`,
      {
        method: "POST",
        body: JSON.stringify({ type, trackId }),
      }
    )
  }
  async discover() {
    // TODO: Implement discovery
    return []
  }
}

export const apiClient = new ApiClient()
