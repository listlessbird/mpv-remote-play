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
import { useState } from "react"
import { apiClient } from "@/lib/api/api-client"
import Slider from "@react-native-community/slider"
import { Ionicons, MaterialIcons } from "@expo/vector-icons"

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

  const [serverUrl, setServerUrl] = useState(connection.serverUrl)
  const [isDiscovering, setIsDiscovering] = useState(false)

  const handleServerUrlSave = () => {
    updateConnection({ serverUrl })
    Alert.alert("Server URL Updated", "The server URL has been updated.")
  }

  const handleDiscoverServers = async () => {
    // TODO: Implement discovery
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
            setServerUrl(connection.serverUrl)
            Alert.alert(
              "Settings Reset",
              "All settings have been reset to defaults."
            )
          },
        },
      ]
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection Settings</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Server URL</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.100:3000"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.inputButton}
              onPress={handleServerUrlSave}
            >
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Auto Discovery</Text>
          <View style={styles.switchContainer}>
            <Switch
              value={connection.autoDiscovery}
              onValueChange={(value) =>
                updateConnection({ autoDiscovery: value })
              }
              trackColor={{ false: colors.textMuted, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, isDiscovering && styles.buttonDisabled]}
          onPress={handleDiscoverServers}
          disabled={isDiscovering}
        >
          <MaterialIcons name="search" size={20} color={colors.text} />
          <Text style={styles.buttonText}>
            {isDiscovering ? "Searching..." : "Discover Servers"}
          </Text>
        </TouchableOpacity>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Show Connection Status</Text>
          <View style={styles.switchContainer}>
            <Switch
              value={connection.showConnectionStatus}
              onValueChange={(value) =>
                updateConnection({ showConnectionStatus: value })
              }
              trackColor={{ false: colors.textMuted, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Connection Timeout</Text>
          <Text style={styles.settingValue}>
            {connection.connectionTimeout / 1000}s
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Playback Settings</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Seek Forward Interval</Text>
          <Text style={styles.settingValue}>
            {playback.seekForwardInterval}s
          </Text>
        </View>
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

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Seek Backward Interval</Text>
          <Text style={styles.settingValue}>
            {playback.seekBackwardInterval}s
          </Text>
        </View>
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
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync & Performance</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Background Sync</Text>
          <View style={styles.switchContainer}>
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
      </View>

      <TouchableOpacity
        style={[styles.button, styles.dangerButton]}
        onPress={handleResetDefaults}
      >
        <MaterialIcons name="restore" size={20} color={colors.text} />
        <Text style={styles.buttonText}>Reset to Defaults</Text>
      </TouchableOpacity>
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
  sectionTitle: {
    ...defaultStyles.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  settingLabel: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    flex: 1,
  },
  settingValue: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    color: colors.textMuted,
    minWidth: 40,
    textAlign: "right",
  },
  switchContainer: {
    marginLeft: 16,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    marginLeft: 16,
  },
  textInput: {
    flex: 1,
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.textMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  inputButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  slider: {
    width: "100%",
    height: 40,
    marginBottom: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.textMuted,
    borderRadius: 8,
    overflow: "hidden",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: "600",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    fontWeight: "600",
    marginLeft: 8,
  },
  dangerButton: {
    backgroundColor: "#dc2626",
  },
})
