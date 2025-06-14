import { apiClient } from "@/lib/api/api-client"
import type {
  MPVInstance,
  RemoteCommand,
  SeekCommand,
  VolumeCommand,
} from "@/lib/api/api-types"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import { usePlaylistStore } from "@/store/playlist"
import { useSettingsStore } from "@/store/settings"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef } from "react"
import TrackPlayer, {
  State,
  useActiveTrack,
  usePlaybackState,
} from "react-native-track-player"

export function usePlayerCommands() {
  const queryClient = useQueryClient()
  const activeTrack = useActiveTrack()
  const { state } = usePlaybackState()
  const { playback } = useSettingsStore()
  const {
    activeInstance,
    setActiveInstance,
    clearIfInvalid,
    validateInstance,
  } = useMPVInstanceStore()
  const { currentPlaylist } = usePlaylistStore()

  const { data: instances } = useQuery({
    queryKey: ["mpv-instances"],
    queryFn: () =>
      apiClient.getMPVInstances().then((instances) => {
        clearIfInvalid()
        return instances
      }),
    refetchInterval: 5 * 1000,
  })

  const createInstanceMutation = useMutation({
    mutationFn: (mediaFile?: string) => apiClient.createMPVInstance(mediaFile),
    onSuccess(data, variables, context) {
      setActiveInstance({
        id: data.instanceId,
        status: "running",
        lastSeen: new Date().toISOString(),
      })
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
    onError: async (error) => {
      console.error("MPV command failed:", error)
      await clearIfInvalid()
    },
  })

  const ensureInstance = useCallback(async () => {
    if (!activeInstance) {
      const mediaFile = activeTrack?.url
      const result = await createInstanceMutation.mutateAsync(mediaFile)
      return result.instanceId
    }

    const isValid = await validateInstance()
    if (!isValid) {
      const mediaFile = activeTrack?.url
      const result = await createInstanceMutation.mutateAsync(mediaFile)
      return result.instanceId
    }

    return activeInstance.id
  }, [activeInstance, activeTrack, validateInstance, createInstanceMutation])

  const syncCommandsToMpv = useCallback(
    async (cmd: RemoteCommand) => {
      try {
        const instanceId = await ensureInstance()

        if (instanceId) {
          await sendCommandMutation.mutateAsync({ instanceId, command: cmd })
        }
      } catch (error) {
        console.error("Failed to send MPV command:", error)
      }
    },
    [ensureInstance, sendCommandMutation]
  )

  const play = useCallback(async () => {
    await syncCommandsToMpv({ action: "play" })
    await TrackPlayer.play()
  }, [syncCommandsToMpv])

  const pause = useCallback(async () => {
    await syncCommandsToMpv({ action: "pause" })
    await TrackPlayer.pause()
  }, [syncCommandsToMpv])

  const stop = useCallback(async () => {
    await TrackPlayer.stop()
    await syncCommandsToMpv({ action: "stop" })
    setActiveInstance(null)
  }, [syncCommandsToMpv, setActiveInstance])

  const seek = useCallback(
    async (position: number) => {
      await TrackPlayer.seekTo(position)
      const seekCommand: SeekCommand = {
        action: "seek",
        params: { time: position, type: "absolute" },
      }
      await syncCommandsToMpv(seekCommand)
    },
    [syncCommandsToMpv]
  )

  const seekForward = useCallback(async () => {
    await syncCommandsToMpv({
      action: "seek",
      params: { time: playback.seekForwardInterval, type: "relative" },
    })
    const currentPosition = await TrackPlayer.getProgress()
    await TrackPlayer.seekTo(
      currentPosition.position + playback.seekForwardInterval
    )
  }, [syncCommandsToMpv, playback.seekForwardInterval])

  const seekBackward = useCallback(async () => {
    await syncCommandsToMpv({
      action: "seek",
      params: { time: -playback.seekBackwardInterval, type: "relative" },
    })
    const currentPosition = await TrackPlayer.getProgress()
    await TrackPlayer.seekTo(
      Math.max(0, currentPosition.position - playback.seekBackwardInterval)
    )
  }, [syncCommandsToMpv, playback.seekBackwardInterval])

  const setVolume = useCallback(
    async (volume: number) => {
      await TrackPlayer.setVolume(volume / 100)
      const volumeCommand: VolumeCommand = {
        action: "volume",
        params: { level: volume },
      }
      await syncCommandsToMpv(volumeCommand)
    },
    [syncCommandsToMpv]
  )

  const skipToNext = useCallback(async () => {
    const nextTrack = await TrackPlayer.getTrack(1)
    if (nextTrack) {
      await TrackPlayer.skipToNext()
      await syncCommandsToMpv({
        action: "loadfile",
        params: { file: nextTrack.url, mode: "replace" },
      })
    }
  }, [syncCommandsToMpv])

  const skipToPrevious = useCallback(async () => {
    const currentIndex = await TrackPlayer.getActiveTrackIndex()
    if (currentIndex && currentIndex > 0) {
      await TrackPlayer.skipToPrevious()
      const prevTrack = await TrackPlayer.getTrack(currentIndex - 1)
      if (prevTrack) {
        await syncCommandsToMpv({
          action: "loadfile",
          params: { file: prevTrack.url, mode: "replace" },
        })
      }
    }
  }, [syncCommandsToMpv])

  useEffect(() => {
    if (state === State.Ended && currentPlaylist.length > 0) {
      skipToNext()
    }
  }, [state, currentPlaylist, skipToNext])

  return {
    play,
    pause,
    seek,
    stop,
    setVolume,
    seekForward,
    seekBackward,
    skipToNext,
    skipToPrevious,
    isLoading:
      createInstanceMutation.isPending || sendCommandMutation.isPending,
    activeInstance,
  }
}
