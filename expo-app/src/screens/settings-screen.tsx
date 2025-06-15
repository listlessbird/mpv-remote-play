import { colors, fontSize, screenPadding } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { useSettingsStore } from "@/store/settings"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
} from "react-native"
import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api/api-client"
import Slider from "@react-native-community/slider"
import { Ionicons, MaterialIcons } from "@expo/vector-icons"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queries"

type ConnectionStatus = "idle" | "testing" | "success" | "error"

export function SettingsScreen() {
  const {
    connection,
    playback,
    sync,
    updateConnection,
    updatePlayback,
    updateSync,
    resetToDefaults,
  } = useSettingsStore()

  const queryClient = useQueryClient()
  const [serverIp, setServerIp] = useState("")
  const [serverPort, setServerPort] = useState("")
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle")
  const [connectionMessage, setConnectionMessage] = useState("")

  useEffect(() => {
    const url = connection.serverUrl.replace(/^https?:\/\//, "")
    const [ip, port] = url.split(":")
    setServerIp(ip || "")
    setServerPort(port || "3000")
  }, [connection.serverUrl])

  const testConnection = async (url: string) => {
    try {
      setConnectionStatus("testing")
      setConnectionMessage("Testing connection...")

      const tempClient = {
        ...apiClient,
        baseUrl: url,
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch(`${url}/api/status`, {
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          setConnectionStatus("success")
          setConnectionMessage("Connection successful!")

          queryClient.invalidateQueries({ queryKey: queryKeys.serverStatus })
          queryClient.invalidateQueries({ queryKey: queryKeys.shares })
          queryClient.removeQueries({ queryKey: queryKeys.shareContents("") })

          return true
        }

        throw new Error(`Server responded with status ${response.status}`)
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      setConnectionStatus("error")
      if (error instanceof Error && error.name === "AbortError") {
        setConnectionMessage("Connection timed out")
      } else if (error instanceof Error) {
        setConnectionMessage(`Connection failed: ${error.message}`)
      } else {
        setConnectionMessage("Connection failed")
      }
      return false
    }
  }

  const handleServerSave = async () => {
    if (!serverIp.trim()) {
      setConnectionStatus("error")
      setConnectionMessage("Please enter a valid IP address")
      return
    }

    const port = serverPort.trim() || "3000"
    const newUrl = `http://${serverIp.trim()}:${port}`

    const success = await testConnection(newUrl)
    if (success) {
      updateConnection({ serverUrl: newUrl })
    }
  }

  const handleDiscoverServers = async () => {
    setIsDiscovering(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleResetDefaults = () => {
    Alert.alert(
      "Reset to Defaults",
      "Are you sure you want to reset all settings to their default values?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            resetToDefaults()
            const url = connection.serverUrl.replace(/^https?:\/\//, "")
            const [ip, port] = url.split(":")
            setServerIp(ip || "")
            setServerPort(port || "3000")
            setConnectionStatus("idle")
            setConnectionMessage("")
          },
        },
      ]
    )
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "success":
        return "#10b981"
      case "error":
        return "#ef4444"
      case "testing":
        return colors.primary
      default:
        return colors.textMuted
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Server Address</Text>
          <Text style={styles.settingDescription}>
            Enter your media server's IP address and port
          </Text>

          <View style={styles.serverInputContainer}>
            <View style={styles.protocolContainer}>
              <Text style={styles.protocolText}>http://</Text>
            </View>

            <View style={styles.ipInputContainer}>
              <TextInput
                style={styles.ipInput}
                value={serverIp}
                onChangeText={(text) => {
                  setServerIp(text)
                  setConnectionStatus("idle")
                  setConnectionMessage("")
                }}
                placeholder="192.168.1.100"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.colonContainer}>
              <Text style={styles.colonText}>:</Text>
            </View>

            <View style={styles.portInputContainer}>
              <TextInput
                style={styles.portInput}
                value={serverPort}
                onChangeText={(text) => {
                  setServerPort(text)
                  setConnectionStatus("idle")
                  setConnectionMessage("")
                }}
                placeholder="3000"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                connectionStatus === "testing" && styles.saveButtonDisabled,
              ]}
              onPress={handleServerSave}
              disabled={connectionStatus === "testing"}
            >
              {connectionStatus === "testing" ? (
                <MaterialIcons name="sync" size={20} color={colors.text} />
              ) : (
                <Ionicons name="checkmark" size={20} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>

          {connectionMessage && (
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: getStatusColor() },
                ]}
              />
              <Text style={[styles.statusMessage, { color: getStatusColor() }]}>
                {connectionMessage}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Auto Discovery</Text>
            <Text style={styles.settingDescription}>
              Automatically find servers on your network
            </Text>
          </View>
          <Switch
            value={connection.autoDiscovery}
            onValueChange={(value) =>
              updateConnection({ autoDiscovery: value })
            }
            trackColor={{ false: colors.textMuted, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            isDiscovering && styles.secondaryButtonDisabled,
          ]}
          onPress={handleDiscoverServers}
          disabled={isDiscovering}
        >
          <MaterialIcons
            name="search"
            size={20}
            color={isDiscovering ? colors.textMuted : colors.text}
          />
          <Text
            style={[
              styles.secondaryButtonText,
              isDiscovering && styles.secondaryButtonTextDisabled,
            ]}
          >
            {isDiscovering ? "Searching..." : "Discover Servers"}
          </Text>
        </TouchableOpacity>

        <View style={styles.settingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Show Connection Status</Text>
            <Text style={styles.settingDescription}>
              Display connection indicator in the app
            </Text>
          </View>
          <Switch
            value={connection.showConnectionStatus}
            onValueChange={(value) =>
              updateConnection({ showConnectionStatus: value })
            }
            trackColor={{ false: colors.textMuted, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Connection Timeout</Text>
            <Text style={styles.settingDescription}>
              How long to wait for server response
            </Text>
          </View>
          <Text style={styles.settingValue}>
            {connection.connectionTimeout / 1000}s
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Playback</Text>

        <View style={styles.sliderGroup}>
          <View style={styles.sliderHeader}>
            <Text style={styles.settingLabel}>Seek Forward</Text>
            <Text style={styles.settingValue}>
              {playback.seekForwardInterval}s
            </Text>
          </View>
          <Text style={styles.settingDescription}>
            How many seconds to skip forward
          </Text>
          <Slider
            style={styles.slider}
            value={playback.seekForwardInterval}
            minimumValue={5}
            maximumValue={60}
            step={5}
            onSlidingComplete={(value) =>
              updatePlayback({ seekForwardInterval: value })
            }
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.textMuted}
            thumbTintColor={colors.primary}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>5s</Text>
            <Text style={styles.sliderLabel}>60s</Text>
          </View>
        </View>

        <View style={styles.sliderGroup}>
          <View style={styles.sliderHeader}>
            <Text style={styles.settingLabel}>Seek Backward</Text>
            <Text style={styles.settingValue}>
              {playback.seekBackwardInterval}s
            </Text>
          </View>
          <Text style={styles.settingDescription}>
            How many seconds to skip backward
          </Text>
          <Slider
            style={styles.slider}
            value={playback.seekBackwardInterval}
            minimumValue={5}
            maximumValue={60}
            step={5}
            onSlidingComplete={(value) =>
              updatePlayback({ seekBackwardInterval: value })
            }
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.textMuted}
            thumbTintColor={colors.primary}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>5s</Text>
            <Text style={styles.sliderLabel}>60s</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync & Performance</Text>

        <View style={styles.settingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Background Sync</Text>
            <Text style={styles.settingDescription}>
              Keep data synchronized when app is in background
            </Text>
          </View>
          <Switch
            value={sync.backgroundSyncEnabled}
            onValueChange={(value) =>
              updateSync({ backgroundSyncEnabled: value })
            }
            trackColor={{ false: colors.textMuted, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      <View style={styles.dangerSection}>
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleResetDefaults}
        >
          <MaterialIcons name="restore" size={20} color="#fff" />
          <Text style={styles.dangerButtonText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: screenPadding.x,
    paddingVertical: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
  },
  dangerSection: {
    marginTop: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    ...defaultStyles.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
    marginBottom: 20,
    color: colors.text,
  },
  settingGroup: {
    marginBottom: 24,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingVertical: 4,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    fontWeight: "600",
    marginBottom: 4,
    color: colors.text,
  },
  settingDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 18,
  },
  settingValue: {
    fontSize: fontSize.base,
    color: colors.primary,
    fontWeight: "600",
    minWidth: 50,
    textAlign: "right",
  },
  serverInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  protocolContainer: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  protocolText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: "500",
  },
  ipInputContainer: {
    flex: 1,
  },
  ipInput: {
    fontSize: fontSize.base,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 14,
    textAlign: "left",
  },
  colonContainer: {
    paddingHorizontal: 4,
  },
  colonText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: "500",
  },
  portInputContainer: {
    width: 80,
  },
  portInput: {
    fontSize: fontSize.base,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 14,
    textAlign: "center",
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 17,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "stretch",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusMessage: {
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: "600",
    marginLeft: 8,
  },
  secondaryButtonTextDisabled: {
    color: colors.textMuted,
  },
  sliderGroup: {
    marginBottom: 24,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  slider: {
    width: "100%",
    height: 40,
    marginTop: 12,
    marginBottom: 8,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sliderLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dc2626",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  dangerButtonText: {
    fontSize: fontSize.base,
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
  },
})
