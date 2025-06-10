import { useEffect, useRef } from "react"
import TrackPlayer, { RepeatMode } from "react-native-track-player"

async function setupPlayer() {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 10,
  })

  await TrackPlayer.setVolume(0.4)
  await TrackPlayer.setRepeatMode(RepeatMode.Queue)
}

export function useSetupTrackPlayer({ onLoad }: { onLoad?: () => void }) {
  const isSetup = useRef(false)

  useEffect(() => {
    setupPlayer()
      .then(() => {
        isSetup.current = true
        onLoad?.()
      })
      .catch((e) => {
        isSetup.current = false
        console.error(e)
      })
  }, [onLoad])
}
