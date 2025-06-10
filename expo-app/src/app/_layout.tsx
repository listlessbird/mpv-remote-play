import { ErrorBoundary } from "@/components/error-boundary"
import { QueryProvider } from "@/hooks/query-client"
import { useSetupTrackPlayer } from "@/hooks/use-setup-track-player"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { SplashScreen } from "expo-router"
import { useCallback } from "react"
import { useLogPlayerState } from "@/hooks/use-log-player-state"

SplashScreen.preventAutoHideAsync()

const App = () => {
  const handleTrackPlayerReady = useCallback(() => {
    SplashScreen.hideAsync()
  }, [])

  useSetupTrackPlayer({
    onLoad: handleTrackPlayerReady,
  })
  useLogPlayerState()

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryProvider>
          <Stack>
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false,
              }}
            />
          </Stack>
        </QueryProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}

export default App
