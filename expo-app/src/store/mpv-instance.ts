import { apiClient } from "@/lib/api/api-client"
import type { MPVInstance } from "@/lib/api/api-types"
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

interface MPVInstanceStore {
  activeInstance: MPVInstance | null
  setActiveInstance: (instance: MPVInstance | null) => void
  isValidating: boolean
  lastValidation: Date | null
  validateInstance: () => Promise<boolean>
  clearIfInvalid: () => Promise<void>
  clearActiveInstance: () => void
  initializeStore: () => Promise<void>
}

export const useMPVInstanceStore = create<MPVInstanceStore>()(
  subscribeWithSelector((set, get) => ({
    activeInstance: null,
    isValidating: false,
    lastValidation: null,
    setActiveInstance: (instance) => set({ activeInstance: instance }),
    validateInstance: async () => {
      const { activeInstance } = get()
      if (!activeInstance) return false

      set({ isValidating: true })

      try {
        const instances = await apiClient.getMPVInstances()

        const exists = instances.some(
          (i) => i.id === activeInstance.id && i.status === "running"
        )

        set({ lastValidation: new Date() })

        return exists
      } catch (error) {
        console.error("Failed to validate MPV instance:", error)
        return false
      } finally {
        set({ isValidating: false })
      }
    },
    clearIfInvalid: async () => {
      const isValid = await get().validateInstance()
      if (!isValid) {
        set({ activeInstance: null })
      }
    },
    clearActiveInstance: () => {
      set({ activeInstance: null })
    },
    initializeStore: async () => {
      const { activeInstance } = get()
      if (activeInstance) {
        console.log(
          "[MPVInstanceStore] Checking existing instance on startup:",
          activeInstance.id
        )
        try {
          const instances = await apiClient.getMPVInstances()
          const exists = instances.some(
            (i) => i.id === activeInstance.id && i.status === "running"
          )
          if (!exists) {
            console.log(
              "[MPVInstanceStore] Stale instance found, clearing:",
              activeInstance.id
            )
            set({ activeInstance: null })
          } else {
            console.log(
              "[MPVInstanceStore] Instance is valid:",
              activeInstance.id
            )
          }
        } catch (error) {
          console.error(
            "[MPVInstanceStore] Failed to validate instance on startup, clearing:",
            error
          )
          set({ activeInstance: null })
        }
      }
    },
  }))
)
