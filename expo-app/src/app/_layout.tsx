import { ErrorBoundary } from "@/components/error-boundary"
import { ServerStatusIndicator } from "@/components/network-error"
import { QueryProvider } from "@/hooks/query-client"
import { useConnectionStats } from "@/hooks/use-connection-stats"
import { useLogPlayerState } from "@/hooks/use-log-player-state"
import { useSetupTrackPlayer } from "@/hooks/use-setup-track-player"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import { Stack } from "expo-router"
import { SplashScreen } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect } from "react"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

SplashScreen.preventAutoHideAsync()

function AppContent() {
  const { initializeStore } = useMPVInstanceStore()

  const handleTrackPlayerReady = useCallback(() => {
    SplashScreen.hideAsync()
  }, [])

  useSetupTrackPlayer({
    onLoad: handleTrackPlayerReady,
  })

  useLogPlayerState()

  useEffect(() => {
    initializeStore()
  }, [initializeStore])

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryProvider>
            <AppContent />
          </QueryProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}

export default App
