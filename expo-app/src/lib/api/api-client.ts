import type { ServerStatus, Share, ShareContents } from "@/lib/api/api-types"
import { fetch, FetchRequestInit } from "expo/fetch"

class ApiClient {
  private baseUrl: string

  constructor(baseUrl = "http://10.0.2.2:3000") {
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
}

export const apiClient = new ApiClient()
