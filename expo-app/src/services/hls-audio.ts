import { useSettingsStore } from "@/store/settings"
import TrackPlayer, { State } from "react-native-track-player"

export class HLSAudioService {
  private static instance: HLSAudioService
  private currentInstanceId: string | null = null
  private isSyncing = false

  static getInstance(): HLSAudioService {
    if (!HLSAudioService.instance) {
      HLSAudioService.instance = new HLSAudioService()
    }
    return HLSAudioService.instance
  }

  private constructor() {}

  async startHLSPlayback(instanceId: string, initialPosition?: number) {
    console.log(
      "[HLSAudioService] Starting HLS playback for instance:",
      instanceId
    )

    if (this.currentInstanceId === instanceId) {
      console.log("[HLSAudioService] Already playing this instance, skipping")
      return
    }

    this.currentInstanceId = instanceId

    const { serverUrl } = useSettingsStore().connection

    const hlsUrl = `${serverUrl}/api/instances/${instanceId}/hls/playlist.m3u8`
    console.log("[HLSAudioService] HLS URL:", hlsUrl)

    try {
      await TrackPlayer.reset()
      console.log("[HLSAudioService] TrackPlayer reset complete")

      await TrackPlayer.add({
        id: `hls-${instanceId}`,
        url: hlsUrl,
        title: "HLS Stream",
        artist: "MPV Remote",
      })
      console.log("[HLSAudioService] HLS track added to queue")

      if (initialPosition) {
        console.log(
          "[HLSAudioService] Seeking to initial position:",
          initialPosition
        )
        await TrackPlayer.seekTo(initialPosition)
      }

      await TrackPlayer.play()
      console.log("[HLSAudioService] HLS playback started")
    } catch (error) {
      console.error("[HLSAudioService] Error starting HLS playback:", error)
    }
  }

  async syncWithMPV(mpvState: { position: number; paused: boolean }) {
    if (this.isSyncing) return

    this.isSyncing = true

    try {
      const playerState = await TrackPlayer.getPlaybackState()
      const playerPosition = (await TrackPlayer.getProgress()).position

      // console.log(
      //   "[HLSAudioService:Sync] Syncing - MPV paused:",
      //   mpvState.paused,
      //   "Player state:",
      //   playerState.state,
      //   "Position diff:",
      //   Math.abs(playerPosition - mpvState.position)
      // )

      if (mpvState.paused && playerState.state === State.Playing) {
        await TrackPlayer.pause()
        // console.log(
        //   "[HLSAudioService:Sync] Paused TrackPlayer to sync with MPV"
        // )
      } else if (!mpvState.paused && playerState.state !== State.Playing) {
        await TrackPlayer.play()
        // console.log(
        //   "[HLSAudioService:Sync] Started TrackPlayer to sync with MPV"
        // )
      }

      const positionDiff = Math.abs(playerPosition - mpvState.position)

      if (positionDiff > 2) {
        // console.log(
        //   "[HLSAudioService:Sync] Seeking to sync position:",
        //   mpvState.position
        // )
        await TrackPlayer.seekTo(mpvState.position)
      }
    } catch (error) {
      // console.error("[HLSAudioService:Sync] Error syncing with MPV:", error)
    } finally {
      this.isSyncing = false
    }
  }

  async stop() {
    console.log("[HLSAudioService] Stopping HLS playback")
    this.currentInstanceId = null
    await TrackPlayer.stop()
    await TrackPlayer.reset()
  }
}

export const hlsAudioService = HLSAudioService.getInstance()
