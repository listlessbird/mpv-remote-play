import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { ActivityIndicator, StyleSheet, View, Text } from "react-native"

interface LoadingSpinnerProps {
  size?: "small" | "large"
  color?: string
  message?: string
}

export function LoadingSpinner({
  size = "large",
  color = colors.primary,
  message = "Loading...",
}: LoadingSpinnerProps) {
  return (
    <View style={styles.spinnerContainer}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.loadingMessage}>{message}</Text>}
    </View>
  )
}

export function FullScreenLoading({ message }: { message?: string }) {
  return (
    <View style={styles.fullScreenContainer}>
      <LoadingSpinner message={message} />
    </View>
  )
}

const styles = StyleSheet.create({
  spinnerContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  fullScreenContainer: {
    justifyContent: "center",
    alignItems: "center",
    ...defaultStyles.container,
  },
  loadingMessage: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 12,
    textAlign: "center",
  },
})
