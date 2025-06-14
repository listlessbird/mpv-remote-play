import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface ConnectionSettings {
  serverUrl: string
  connectionTimeout: number
  autoDiscovery: boolean
  showConnectionStatus: boolean
}

interface SyncSettings {
  backgroundSyncEnabled: boolean
}

interface PlaybackSettings {
  seekForwardInterval: number
  seekBackwardInterval: number
}

interface SettingsStore {
  connection: ConnectionSettings
  playback: PlaybackSettings
  sync: SyncSettings

  updateConnection: (settings: Partial<ConnectionSettings>) => void
  updatePlayback: (settings: Partial<PlaybackSettings>) => void
  updateSync: (settings: Partial<SyncSettings>) => void

  resetToDefaults: () => void
}

const defaultSettings = {
  connection: {
    // Default to local development server the emulator can connect to
    serverUrl: "http://10.0.2.2:3000",
    connectionTimeout: 10 * 1000,
    autoDiscovery: false,
    showConnectionStatus: true,
  },
  playback: {
    seekForwardInterval: 10,
    seekBackwardInterval: 5,
  },
  sync: {
    backgroundSyncEnabled: true,
  },
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updateConnection(settings) {
        set((state) => ({
          connection: { ...state.connection, ...settings },
        }))
      },

      updatePlayback(settings) {
        set((state) => ({
          playback: { ...state.playback, ...settings },
        }))
      },

      updateSync(settings) {
        set((state) => ({
          sync: { ...state.sync, ...settings },
        }))
      },

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: "mpv-remote-play-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
