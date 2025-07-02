import { apiClient } from "@/lib/api/api-client"
import type {
  MPVInstance,
  RemoteCommand,
  SeekCommand,
  VolumeCommand,
} from "@/lib/api/api-types"
import { hlsAudioService } from "@/services/hls-audio"
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
    queryFn: () => apiClient.getMPVInstances(),
    refetchInterval: 5 * 1000,
  })

  const { data: hlsStatus } = useQuery({
    queryKey: ["hls-status", activeInstance?.id],
    queryFn: () => {
      if (!activeInstance?.id) return null
      return apiClient.getHLSStatus(activeInstance.id)
    },
    enabled: !!activeInstance?.id,
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

  const createInstanceWithAudioMutation = useMutation({
    mutationFn: (mediaFile?: string) =>
      apiClient.createMPVInstance(mediaFile, true),
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

      // Only clear instance if the error indicates the instance is actually invalid
      // Don't clear on temporary network/connection errors
      const errorMessage = error?.message || ""
      const isInstanceInvalidError =
        errorMessage.includes("Instance not found") ||
        errorMessage.includes("instance does not exist") ||
        errorMessage.includes("No such file or directory")

      if (isInstanceInvalidError) {
        console.log("Clearing invalid instance due to:", errorMessage)
        await clearIfInvalid()
      } else {
        console.log("Temporary error, keeping instance:", errorMessage)
      }
    },
  })

  const ensureInstance = useCallback(async () => {
    if (!activeInstance) {
      const mediaFile = activeTrack?.url
      const result = await createInstanceWithAudioMutation.mutateAsync(
        mediaFile
      )
      return result.instanceId
    }

    const isValid = await validateInstance()
    if (!isValid) {
      const mediaFile = activeTrack?.url
      const result = await createInstanceWithAudioMutation.mutateAsync(
        mediaFile
      )
      return result.instanceId
    }

    return activeInstance.id
  }, [
    activeInstance,
    activeTrack,
    validateInstance,
    createInstanceWithAudioMutation,
  ])

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

  const preparePlaybackWithAudio = useCallback(async () => {
    if (!activeInstance?.id) return

    try {
      const result = await createInstanceWithAudioMutation.mutateAsync(
        activeInstance.id
      )
      setActiveInstance({
        id: result.instanceId,
        status: "running",
        lastSeen: new Date().toISOString(),
      })
    } catch (error) {}
  }, [activeInstance, createInstanceWithAudioMutation, setActiveInstance])

  const play = useCallback(async () => {
    // console.log("playlist", { rnTp: await TrackPlayer.getQueue() })
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
    const currentIndex = await TrackPlayer.getActiveTrackIndex()
    const queue = await TrackPlayer.getQueue()

    if (
      currentIndex === null ||
      (currentIndex && currentIndex >= queue.length - 1)
    ) {
      return
    }

    await TrackPlayer.skipToNext()
    const nextTrack = await TrackPlayer.getActiveTrack()
    if (nextTrack) {
      await syncCommandsToMpv({
        action: "loadfile",
        params: { file: nextTrack.url, mode: "replace" },
      })
    }
  }, [syncCommandsToMpv])

  const skipToPrevious = useCallback(async () => {
    const currentIndex = await TrackPlayer.getActiveTrackIndex()

    if (currentIndex === null || (currentIndex && currentIndex <= 0)) {
      return
    }

    await TrackPlayer.skipToPrevious()
    const prevTrack = await TrackPlayer.getActiveTrack()
    if (prevTrack) {
      await syncCommandsToMpv({
        action: "loadfile",
        params: { file: prevTrack.url, mode: "replace" },
      })
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
