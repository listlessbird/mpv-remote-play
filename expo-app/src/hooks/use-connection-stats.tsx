import { useServerStatus } from "@/lib/queries"
import { useCallback, useEffect, useState } from "react"
import NetInfo from "@react-native-community/netinfo"

interface ConnectionStats {
  isConnected: boolean
  isNetworkAvailable: boolean
  lastError: Error | null
  errorType: "connection" | "server" | "timeout" | "unknown" | null
}

export function useConnectionStats() {
  const [stats, setStats] = useState<ConnectionStats>({
    isConnected: false,
    isNetworkAvailable: false,
    lastError: null,
    errorType: null,
  })

  const { data, error, isLoading } = useServerStatus()

  const classifyError = useCallback(
    (error: Error): ConnectionStats["errorType"] => {
      const message = error.message.toLowerCase()

      if (message.includes("network") || message.includes("fetch")) {
        return "connection"
      }
      if (message.includes("timeout")) {
        return "timeout"
      }
      if (
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503")
      ) {
        return "server"
      }
      return "unknown"
    },
    []
  )

  useEffect(() => {
    const unsub = NetInfo.addEventListener((netState) => {
      setStats((prev) => ({
        ...prev,
        isNetworkAvailable: netState.isConnected ?? false,
      }))
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (data && !error) {
      setStats({
        isConnected: true,
        isNetworkAvailable: true,
        lastError: null,
        errorType: null,
      })
    } else if (error) {
      setStats((prev) => ({
        ...prev,
        isConnected: false,
        lastError: error as Error,
        errorType: classifyError(error as Error),
      }))
    }
  }, [data, error, classifyError])

  return {
    ...stats,
    isChecking: isLoading,
  }
}
