import { apiClient } from "@/lib/api/api-client"
import { hlsAudioService } from "@/services/hls-audio"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"

interface HLSPlaybackState {
  status: "idle" | "creating" | "waiting" | "ready" | "playing" | "error"
  error?: Error
}

export function useHlsPlayback() {
  const { activeInstance, setActiveInstance } = useMPVInstanceStore()

  const [hlsPlaybackState, setHlsPlaybackState] = useState<HLSPlaybackState>({
    status: "idle",
  })

  const [shouldPollStatus, setShouldPollStatus] = useState(false)

  const createHLSInstanceMutation = useMutation({
    mutationFn: (mediaFile: string) =>
      apiClient.createMPVInstance(mediaFile, true),
    onSuccess(data, variables, context) {
      setActiveInstance({
        id: data.instanceId,
        status: "running",
        lastSeen: new Date().toISOString(),
      })
      setHlsPlaybackState({ status: "waiting" })
      setShouldPollStatus(true)
    },
    onError(error, variables, context) {
      setHlsPlaybackState({ status: "error", error: error as Error })
    },
  })

  const { data: hlsStatus } = useQuery({
    queryKey: ["hls-status", activeInstance?.id],
    queryFn: () => {
      if (!activeInstance?.id) return null
      return apiClient.getHLSStatus(activeInstance.id)
    },
    enabled: !!activeInstance?.id && shouldPollStatus,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (!hlsStatus || !shouldPollStatus || !activeInstance?.id) return

    const handleStatusReady = async () => {
      if (
        hlsStatus.status === "ready" &&
        hlsPlaybackState.status === "waiting"
      ) {
        setHlsPlaybackState({ status: "ready" })
        setShouldPollStatus(false)

        try {
          await hlsAudioService.startHLSPlayback(activeInstance.id)
          setHlsPlaybackState({ status: "playing" })
        } catch (error) {
          console.error("Error starting HLS playback", error)
          setHlsPlaybackState({ status: "error", error: error as Error })
        }
      }
    }

    handleStatusReady()
  }, [hlsStatus, shouldPollStatus, hlsPlaybackState.status, activeInstance?.id])

  const startHlsPlayback = useCallback(
    async (mediaFile: string) => {
      if (
        hlsPlaybackState.status === "creating" ||
        hlsPlaybackState.status === "waiting"
      ) {
        console.log(
          "HLS playback already in progress, skipping:",
          hlsPlaybackState.status
        )
        return
      }

      console.log("Starting HLS playback for:", mediaFile)
      setHlsPlaybackState({ status: "creating" })
      createHLSInstanceMutation.mutate(mediaFile)
    },
    [createHLSInstanceMutation, hlsPlaybackState.status]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    return () => {
      setShouldPollStatus(false)
    }
  }, [activeInstance?.id])

  // Reset error state after a delay to allow retry
  useEffect(() => {
    if (hlsPlaybackState.status === "error") {
      const timeoutId = setTimeout(() => {
        console.log("Resetting HLS playback state from error")
        setHlsPlaybackState({ status: "idle" })
      }, 5000) // Reset after 5 seconds

      return () => clearTimeout(timeoutId)
    }
  }, [hlsPlaybackState.status])

  return {
    hlsPlaybackState,
    startHlsPlayback,
    hlsStatus,
    isLoading:
      hlsPlaybackState.status === "creating" ||
      hlsPlaybackState.status === "waiting",
    isReady:
      hlsPlaybackState.status === "ready" ||
      hlsPlaybackState.status === "playing",
  }
}
