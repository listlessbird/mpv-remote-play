import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { useServerStatus } from "@/lib/queries"
import { useSettingsStore } from "@/store/settings"
import { View, Text, StyleSheet } from "react-native"
import { MaterialIcons } from "@expo/vector-icons"

export function ConnectionStatus() {
  const { showConnectionStatus } = useSettingsStore((state) => state.connection)
  const { data: status, isError, isLoading } = useServerStatus()

  if (!showConnectionStatus) return null

  const isConnected = !isError && !isLoading && status

  return (
    <View
      style={[
        styles.container,
        isConnected ? styles.connected : styles.disconnected,
      ]}
    >
      <MaterialIcons
        name={isConnected ? "check-circle" : "error"}
        size={16}
        color={isConnected ? colors.primary : colors.textMuted}
      />
      <Text style={styles.text}>
        {isLoading
          ? "Connecting..."
          : isConnected
          ? "Connected"
          : "Disconnected"}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
    alignSelf: "center",
    gap: 6,
  },
  connected: {
    backgroundColor: "rgba(252, 60, 68, 0.1)",
  },
  disconnected: {
    backgroundColor: "rgba(156, 163, 175, 0.1)",
  },
  text: {
    ...defaultStyles.text,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
})
