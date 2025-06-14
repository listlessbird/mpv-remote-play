import type { Track } from "@/lib/api/api-types"
import { API_BASE_URL } from "@/lib/constants/constants"
import TrackPlayer, { type Track as RNTPTrack } from "react-native-track-player"
import { create } from "zustand"
interface PlaylistStore {
  currentPlaylist: Track[]
  currentIndex: number
  isLoading: boolean
  setPlaylist: (playlist: Track[], startIndex: number) => void
  loadPlaylistToPlayer: () => Promise<void>
  clear: () => void
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  currentPlaylist: [],
  currentIndex: 0,
  isLoading: false,

  setPlaylist(playlist, startIndex = 0) {
    set({
      currentPlaylist: playlist,
      currentIndex: startIndex,
      isLoading: true,
    })
  },

  loadPlaylistToPlayer: async () => {
    const { currentPlaylist, currentIndex } = get()
    if (currentPlaylist.length === 0) return

    try {
      await TrackPlayer.reset()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const rntpTracks: RNTPTrack[] = currentPlaylist.map((track) => ({
        id: track.id,
        url: track.src,
        title: track.title,
        artist: track.playlist || "Unknown Playlist",
        artwork: track.thumbnail.startsWith("http")
          ? track.thumbnail
          : `${API_BASE_URL}/api/thumbnails/${track.id}`,
        duration: track.duration,
      }))

      await TrackPlayer.add(rntpTracks)
      await new Promise((resolve) => setTimeout(resolve, 200))

      if (currentIndex > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100))

        await TrackPlayer.skip(currentIndex)
        await new Promise((resolve) => setTimeout(resolve, 100))
        const activeTrack = await TrackPlayer.getActiveTrack()

        const activeIndex = await TrackPlayer.getActiveTrackIndex()
        console.log("Active track after skip:", activeTrack?.title)

        if (activeIndex !== currentIndex) {
          console.error(
            `Failed to skip to index ${currentIndex}, got ${activeIndex}`
          )
        }
      }

      set({ isLoading: false })
    } catch (error) {
      console.error("Failed to load playlist to player:", error)
      set({ isLoading: false })
      throw error
    }
  },

  clear() {
    set({
      currentIndex: 0,
      currentPlaylist: [],
      isLoading: false,
    })
  },
}))
