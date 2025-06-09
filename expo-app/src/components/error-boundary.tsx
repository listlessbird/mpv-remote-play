import React, { Component, ReactNode } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />
        )
      )
    }

    return this.props.children
  }
}

interface ErrorFallbackProps {
  error?: Error
  onRetry?: () => void
}

export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        {error?.message || "An unexpected error occurred"}
      </Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

interface QueryErrorProps {
  error: Error
  onRetry?: () => void
  message?: string
}

export function QueryError({ error, onRetry, message }: QueryErrorProps) {
  return (
    <View style={styles.queryErrorContainer}>
      <Text style={styles.queryErrorTitle}>
        {message || "Failed to load data"}
      </Text>
      <Text style={styles.queryErrorMessage}>{error.message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  title: {
    ...defaultStyles.text,
    fontSize: fontSize.lg,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  message: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 24,
  },
  queryErrorContainer: {
    padding: 20,
    alignItems: "center",
  },
  queryErrorTitle: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
    color: colors.text,
  },
  queryErrorMessage: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
})
