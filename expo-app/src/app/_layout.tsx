import { ErrorBoundary } from "@/components/error-boundary"
import { QueryProvider } from "@/hooks/query-client"
import { useSetupTrackPlayer } from "@/hooks/use-setup-track-player"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { SplashScreen } from "expo-router"
import { useCallback } from "react"
import { useLogPlayerState } from "@/hooks/use-log-player-state"
import { ServerStatusIndicator } from "@/components/network-error"
import { useConnectionStats } from "@/hooks/use-connection-stats"

SplashScreen.preventAutoHideAsync()

function AppContent() {
  const handleTrackPlayerReady = useCallback(() => {
    SplashScreen.hideAsync()
  }, [])

  useSetupTrackPlayer({
    onLoad: handleTrackPlayerReady,
  })

  useLogPlayerState()

  const { isConnected, isChecking, lastError } = useConnectionStats()

  return (
    <>
      <ServerStatusIndicator isConnected={isConnected} lastError={lastError} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryProvider>
          <AppContent />
        </QueryProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}

export default App
