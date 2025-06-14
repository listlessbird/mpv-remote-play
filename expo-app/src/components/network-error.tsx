import React from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { MaterialIcons } from "@expo/vector-icons"

interface NetworkErrorProps {
  error: Error
  onRetry?: () => void
  type?: "connection" | "server" | "timeout" | "unknown"
}

export function NetworkError({
  error,
  onRetry,
  type = "unknown",
}: NetworkErrorProps) {
  const getErrorDetails = () => {
    switch (type) {
      case "connection":
        return {
          icon: "wifi-off",
          title: "Connection Failed",
          message:
            "Unable to connect to the server. Please check your network connection.",
        }
      case "server":
        return {
          icon: "cloud-off",
          title: "Server Error",
          message: "The server is not responding. Please try again later.",
        }
      case "timeout":
        return {
          icon: "access-time",
          title: "Request Timeout",
          message: "The request took too long. Please try again.",
        }
      default:
        return {
          icon: "error-outline",
          title: "Something went wrong",
          message: error.message || "An unexpected error occurred.",
        }
    }
  }

  const { icon, title, message } = getErrorDetails()

  return (
    <View style={styles.container}>
      <MaterialIcons name={icon as any} size={64} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <MaterialIcons name="refresh" size={20} color={colors.text} />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

interface ServerStatusIndicatorProps {
  isConnected: boolean
  lastError?: Error | null
}

export function ServerStatusIndicator({
  isConnected,
  lastError,
}: ServerStatusIndicatorProps) {
  if (isConnected) return null

  return (
    <View style={styles.statusBar}>
      <MaterialIcons name="warning" size={16} color={colors.text} />
      <Text style={styles.statusText}>
        {lastError ? "Server connection lost" : "Connecting to server..."}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    ...defaultStyles.text,
    fontSize: fontSize.lg,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.base,
    fontWeight: "600",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(252, 60, 68, 0.2)",
    padding: 12,
    gap: 8,
  },
  statusText: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
  },
})
