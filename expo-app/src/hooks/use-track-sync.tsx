import { apiClient } from "@/lib/api/api-client"
import { MPVInstance, GetPropertyCommand } from "@/lib/api/api-types"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"
import TrackPlayer, { useProgress } from "react-native-track-player"

export function useTrackSync() {
  const { position } = useProgress()
  const lastSyncedPosition = useRef(0)
  const syncThreshold = 5

  //   const { data: activeInstance } = useQuery({
  //     queryKey: ["mpv", "active-instance"],
  //     queryFn: async () => {
  //       const instances = await apiClient.getMPVInstances()
  //       return instances.find((instance) => instance.status === "running")
  //     },
  //     refetchInterval: 2 * 1000,
  //   })

  const { data: instances } = useQuery({
    queryKey: ["mpv-instances"],
    queryFn: () => apiClient.getMPVInstances(),
    refetchInterval: 5 * 1000,
  })

  const activeInstance = useMemo(() => {
    return instances?.find((i: MPVInstance) => i.status === "running")
  }, [instances])

  const { data: mpvState } = useQuery({
    queryKey: ["mpv", "state", activeInstance?.id],
    queryFn: async () => {
      if (!activeInstance?.id) return null

      try {
        const timePosCommand: GetPropertyCommand = {
          action: "get_property",
          params: { property: "time-pos" },
        }
        const durationCommand: GetPropertyCommand = {
          action: "get_property",
          params: { property: "duration" },
        }
        const pausedCommand: GetPropertyCommand = {
          action: "get_property",
          params: { property: "pause" },
        }

        const [timePosResponse, durationResponse, pausedResponse] =
          await Promise.all([
            apiClient.sendMPVCommand(activeInstance.id, timePosCommand),
            apiClient.sendMPVCommand(activeInstance.id, durationCommand),
            apiClient.sendMPVCommand(activeInstance.id, pausedCommand),
          ])

        return {
          position: timePosResponse.data ?? 0,
          duration: durationResponse.data ?? 0,
          paused: pausedResponse.data ?? false,
        }
      } catch (error) {
        console.error("Failed to get MPV state:", error)
        return null
      }
    },
    enabled: !!activeInstance?.id,
    refetchInterval: 1000,
  })

  useEffect(() => {
    if (!mpvState || !activeInstance) return

    const positionDiff = Math.abs(mpvState.position - position)
    const lastSyncDiff = Math.abs(
      mpvState.position - lastSyncedPosition.current
    )

    if (positionDiff > syncThreshold && lastSyncDiff > 1) {
      TrackPlayer.seekTo(mpvState.position)
      lastSyncedPosition.current = mpvState.position
    }
  }, [mpvState, activeInstance, position])

  return { mpvState, activeInstance }
}
