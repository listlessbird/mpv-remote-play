import { apiClient } from "@/lib/api/api-client"
import {
  MPVInstance,
  RemoteCommand,
  SeekCommand,
  VolumeCommand,
} from "@/lib/api/api-types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef } from "react"
import TrackPlayer, { useActiveTrack } from "react-native-track-player"

export function usePlayerCommands() {
  const queryClient = useQueryClient()
  const activeTrack = useActiveTrack()
  const instanceRef = useRef<string | null>(null)

  const { data: instances } = useQuery({
    queryKey: ["mpv-instances"],
    queryFn: () => apiClient.getMPVInstances(),
    refetchInterval: 5 * 1000,
  })

  const activeInstance = useMemo(() => {
    return instances?.find((i: MPVInstance) => i.status === "running")
  }, [instances])

  useEffect(() => {
    if (activeInstance) {
      instanceRef.current = activeInstance.id
    }
  }, [activeInstance])

  const createInstanceMutation = useMutation({
    mutationFn: (mediaFile?: string) => apiClient.createMPVInstance(mediaFile),
    onSuccess(data, variables, context) {
      instanceRef.current = data.instanceId
      queryClient.invalidateQueries({ queryKey: ["mpv-instances"] })
    },
  })

  const sendCommandMutation = useMutation({
    mutationFn: ({
      command,
      instanceId,
    }: {
      instanceId: string
      command: RemoteCommand
    }) => apiClient.sendMPVCommand(instanceId, command),
  })

  const ensureInstance = useCallback(async () => {
    if (!instanceRef.current && !activeInstance) {
      const mediaFile = activeTrack?.url
      const result = await createInstanceMutation.mutateAsync(mediaFile)
      return result.instanceId
    }
    return instanceRef.current || activeInstance?.id
  }, [activeInstance, activeTrack, createInstanceMutation])

  const play = useCallback(async () => {
    const instanceId = await ensureInstance()
    if (instanceId) {
      await sendCommandMutation.mutateAsync({
        instanceId,
        command: { action: "play" },
      })
      await TrackPlayer.play()
    }
  }, [ensureInstance, sendCommandMutation])

  const pause = useCallback(async () => {
    const instanceId = await ensureInstance()
    if (instanceId) {
      await sendCommandMutation.mutateAsync({
        instanceId,
        command: { action: "pause" },
      })
    }
  }, [ensureInstance, sendCommandMutation])

  const seek = useCallback(
    async (position: number) => {
      const instanceId = instanceRef.current || activeInstance?.id
      if (instanceId) {
        const seekCommand: SeekCommand = {
          action: "seek",
          params: { time: position, type: "absolute" },
        }
        await sendCommandMutation.mutateAsync({
          instanceId,
          command: seekCommand,
        })
        await TrackPlayer.seekTo(position)
      }
    },
    [activeInstance, sendCommandMutation]
  )

  const setVolume = useCallback(
    async (volume: number) => {
      const instanceId = instanceRef.current || activeInstance?.id
      if (instanceId) {
        const volumeCommand: VolumeCommand = {
          action: "volume",
          params: { level: volume },
        }
        await sendCommandMutation.mutateAsync({
          instanceId,
          command: volumeCommand,
        })
        await TrackPlayer.setVolume(volume / 100)
      }
    },
    [activeInstance, sendCommandMutation]
  )

  const skipToNext = useCallback(async () => {
    await TrackPlayer.skipToNext()
  }, [])

  const skipToPrevious = useCallback(async () => {
    await TrackPlayer.skipToPrevious()
  }, [])

  const stop = useCallback(async () => {
    await TrackPlayer.stop()
  }, [])

  return {
    play,
    pause,
    seek,
    stop,
    setVolume,
    skipToNext,
    skipToPrevious,
    isLoading:
      createInstanceMutation.isPending || sendCommandMutation.isPending,
    activeInstance,
  }
}
