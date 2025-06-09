import { ErrorBoundary } from "@/components/error-boundary"
import { QueryProvider } from "@/hooks/query-client"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"

const App = () => {
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
