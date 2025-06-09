import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useReactQueryDevTools } from "@dev-plugins/react-query"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
})

export function QueryProvider({ children }: { children: React.ReactNode }) {
  useReactQueryDevTools(queryClient)
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
