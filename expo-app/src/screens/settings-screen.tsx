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
import { queryKeys, useMPVInstances, useRemoveMPVInstance } from "@/lib/queries"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import type { MPVInstance } from "@/lib/api/api-types"

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
  const {
    activeInstance,
    setActiveInstance,
    clearActiveInstance,
    validateInstance,
    isValidating,
  } = useMPVInstanceStore()
  const {
    data: instances = [],
    isLoading: isLoadingInstances,
    error: instancesError,
    refetch: refetchInstances,
  } = useMPVInstances()
  const removeMPVInstanceMutation = useRemoveMPVInstance()

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
          queryClient.invalidateQueries({ queryKey: queryKeys.mpvInstances })
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

  const handleRemoveInstance = async (instanceId: string) => {
    Alert.alert(
      "Remove Instance",
      "Are you sure you want to remove this MPV instance? This will terminate the player.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeMPVInstanceMutation.mutateAsync(instanceId)
              if (activeInstance?.id === instanceId) {
                clearActiveInstance()
              }
            } catch (error) {
              Alert.alert(
                "Error",
                error instanceof Error
                  ? error.message
                  : "Failed to remove instance"
              )
            }
          },
        },
      ]
    )
  }

  const handleValidateInstance = async (instance: MPVInstance) => {
    // First check against current React Query data
    const existsInCache = instances.some(
      (i) => i.id === instance.id && i.status === "running"
    )

    if (existsInCache) {
      Alert.alert(
        "Instance Valid",
        "This MPV instance is running and accessible."
      )
      return
    }

    // If not found in cache, refresh and check again
    Alert.alert(
      "Validating Instance",
      "Instance not found in cache. Refreshing data to double-check...",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Refresh & Validate",
          onPress: async () => {
            try {
              const refreshedData = await refetchInstances()
              const existsAfterRefresh = refreshedData.data?.some(
                (i) => i.id === instance.id && i.status === "running"
              )

              if (existsAfterRefresh) {
                Alert.alert(
                  "Instance Valid",
                  "This MPV instance is running and accessible."
                )
              } else {
                Alert.alert(
                  "Instance Invalid",
                  "This MPV instance is no longer running or accessible."
                )
                // Clear active instance if it's the one being validated
                if (activeInstance?.id === instance.id) {
                  clearActiveInstance()
                }
              }
            } catch (error) {
              Alert.alert(
                "Validation Error",
                error instanceof Error
                  ? error.message
                  : "Failed to validate instance"
              )
            }
          },
        },
      ]
    )
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
        <Text style={styles.sectionTitle}>MPV Instances</Text>

        <View style={styles.settingGroup}>
          <View style={styles.instancesHeader}>
            <Text style={styles.settingDescription}>
              Manage connected MPV player instances
            </Text>
            <TouchableOpacity
              style={[
                styles.refreshButton,
                isLoadingInstances && styles.refreshButtonDisabled,
              ]}
              onPress={() => refetchInstances()}
              disabled={isLoadingInstances}
            >
              <MaterialIcons
                name="refresh"
                size={20}
                color={isLoadingInstances ? colors.textMuted : colors.text}
              />
            </TouchableOpacity>
          </View>

          {instancesError && (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error" size={16} color="#ef4444" />
              <Text style={styles.errorText}>
                {instancesError instanceof Error
                  ? instancesError.message
                  : "Failed to load instances"}
              </Text>
            </View>
          )}

          {isLoadingInstances ? (
            <View style={styles.loadingContainer}>
              <MaterialIcons name="sync" size={20} color={colors.primary} />
              <Text style={styles.loadingText}>Loading instances...</Text>
            </View>
          ) : instances.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="tv-off" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No MPV instances found</Text>
              <Text style={styles.emptySubtext}>
                Start playing media to see instances here
              </Text>
            </View>
          ) : (
            instances.map((instance) => (
              <View key={instance.id} style={styles.instanceItem}>
                <View style={styles.instanceInfo}>
                  <View style={styles.instanceHeader}>
                    <Text style={styles.instanceId}>
                      {instance.clientName ||
                        `Instance ${instance.id.slice(0, 8)}`}
                    </Text>
                    <View style={styles.instanceStatusContainer}>
                      <View
                        style={[
                          styles.instanceStatusDot,
                          {
                            backgroundColor:
                              instance.status === "running"
                                ? "#10b981"
                                : "#ef4444",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.instanceStatus,
                          {
                            color:
                              instance.status === "running"
                                ? "#10b981"
                                : "#ef4444",
                          },
                        ]}
                      >
                        {instance.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.instanceDetails}>ID: {instance.id}</Text>
                  <Text style={styles.instanceDetails}>
                    Last seen: {new Date(instance.lastSeen).toLocaleString()}
                  </Text>
                  {activeInstance?.id === instance.id && (
                    <Text style={styles.activeInstanceLabel}>
                      • Currently Active
                    </Text>
                  )}
                </View>
                <View style={styles.instanceActions}>
                  <TouchableOpacity
                    style={styles.instanceActionButton}
                    onPress={() => handleValidateInstance(instance)}
                  >
                    <MaterialIcons
                      name="check-circle"
                      size={18}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.instanceActionButton}
                    onPress={() => setActiveInstance(instance)}
                  >
                    <MaterialIcons
                      name={
                        activeInstance?.id === instance.id
                          ? "radio-button-checked"
                          : "radio-button-unchecked"
                      }
                      size={18}
                      color={
                        activeInstance?.id === instance.id
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.instanceActionButton,
                      styles.dangerActionButton,
                    ]}
                    onPress={() => handleRemoveInstance(instance.id)}
                  >
                    <MaterialIcons name="delete" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
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
  instancesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: "#ef4444",
    marginLeft: 8,
    flex: 1,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
  },
  instanceItem: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  instanceInfo: {
    flex: 1,
    marginRight: 12,
  },
  instanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  instanceId: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: "600",
  },
  instanceStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  instanceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  instanceStatus: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  instanceDetails: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 2,
  },
  activeInstanceLabel: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 4,
  },
  instanceActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  instanceActionButton: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dangerActionButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
})
