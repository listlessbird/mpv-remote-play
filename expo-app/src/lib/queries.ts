import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ShareContents } from "@/lib/api/api-types"
import { apiClient } from "@/lib/api/api-client"

export const queryKeys = {
  serverStatus: ["server", "status"],
  shares: ["shares"],
  shareContents: (shareName: string, path?: string) => [
    "share",
    shareName,
    path || "",
  ],
}

export function useServerStatus() {
  return useQuery({
    queryKey: queryKeys.serverStatus,
    queryFn: () => apiClient.getServerStatus(),
    refetchInterval: 1000 * 60,
  })
}

export function useShares() {
  return useQuery({
    queryKey: queryKeys.shares,
    queryFn: () => apiClient.getShares(),
  })
}

export function useShareContents(shareName: string, path?: string) {
  return useQuery({
    queryKey: queryKeys.shareContents(shareName, path),
    queryFn: () => apiClient.getShareContents(shareName, path),
    enabled: !!shareName,
  })
}
