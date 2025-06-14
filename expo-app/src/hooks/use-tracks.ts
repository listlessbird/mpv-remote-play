import { apiClient } from "@/lib/api/api-client"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useTracks() {
  const queryClient = useQueryClient()
  const { activeInstance } = useMPVInstanceStore()

  const { data: tracks, isLoading } = useQuery({
    queryKey: ["tracks", activeInstance?.id],
    queryFn: () =>
      activeInstance ? apiClient.getTracks(activeInstance.id) : null,
    enabled: !!activeInstance?.id,
    refetchInterval: 5 * 1000,
  })

  const setTrackMutation = useMutation({
    mutationFn: ({
      type,
      trackId,
    }: {
      type: "audio" | "subtitle"
      trackId: number
    }) => {
      if (!activeInstance) throw new Error("No active instance")
      return apiClient.setTrack(activeInstance.id, type, trackId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tracks", activeInstance?.id],
      })
    },
  })

  // console.log(tracks)

  return {
    tracks,
    isLoading,
    setAudioTrack: (trackId: number) =>
      setTrackMutation.mutate({ type: "audio", trackId }),
    setSubtitleTrack: (trackId: number) =>
      setTrackMutation.mutate({ type: "subtitle", trackId }),
    isSettingTrack: setTrackMutation.isPending,
  }
}
