import { useEffect, useRef } from "react"
import TrackPlayer, { RepeatMode, Capability } from "react-native-track-player"

async function setupPlayer() {
  try {
    await TrackPlayer.setupPlayer({
      maxCacheSize: 1024 * 10,
    })

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.Stop,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause],
    })

    await TrackPlayer.setVolume(0.4)
    await TrackPlayer.setRepeatMode(RepeatMode.Queue)
  } catch (error) {
    console.error("Failed to setup TrackPlayer:", error)
    throw error
  }
}

export function useSetupTrackPlayer({ onLoad }: { onLoad?: () => void }) {
  const isSetup = useRef(false)

  useEffect(() => {
    if (isSetup.current) return

    setupPlayer()
      .then(() => {
        isSetup.current = true
        onLoad?.()
      })
      .catch((e) => {
        isSetup.current = false
        console.error("TrackPlayer setup failed:", e)
      })
  }, [onLoad])
}
