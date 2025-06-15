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
  mpvInstances: ["mpv", "instances"],
}

export function useServerStatus() {
  return useQuery({
    queryKey: queryKeys.serverStatus,
    queryFn: () => apiClient.getServerStatus(),
    refetchInterval: 1000 * 60,
    retry: 2,
    retryDelay: 1000,
    refetchIntervalInBackground: true,
  })
}

export function useShares() {
  return useQuery({
    queryKey: queryKeys.shares,
    queryFn: () => apiClient.getShares(),
  })
}

export function useShareContents(shareName: string, path?: string) {
  // console.log("useShareContents", shareName, path)
  return useQuery({
    queryKey: queryKeys.shareContents(shareName, path),
    queryFn: () => apiClient.getShareContents(shareName, path),
    enabled: !!shareName,
  })
}

export function useMPVInstances() {
  return useQuery({
    queryKey: queryKeys.mpvInstances,
    queryFn: () => apiClient.getMPVInstances(),
    refetchInterval: 1000 * 30, // Refetch every 30 seconds
    retry: 2,
    retryDelay: 1000,
  })
}

export function useRemoveMPVInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceId: string) => apiClient.removeMPVInstance(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mpvInstances })
    },
  })
}
