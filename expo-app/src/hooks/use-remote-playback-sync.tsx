/**
 * Syncs the hls playback with the remote mpv playback state
 */

import { useTrackSync } from "@/hooks/use-track-sync"
import { hlsAudioService } from "@/services/hls-audio"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import { useEffect } from "react"

export function useRemotePlaybackSync() {
  const { activeInstance } = useMPVInstanceStore()
  const { mpvState } = useTrackSync()

  useEffect(() => {
    if (!mpvState || !activeInstance) return

    hlsAudioService.syncWithMPV({
      position: mpvState.position,
      paused: mpvState.paused,
    })
  }, [mpvState, activeInstance])

  return { mpvState }
}
