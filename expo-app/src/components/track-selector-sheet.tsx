import { useTracks } from "@/hooks/use-tracks"
import type { TrackInfo } from "@/lib/api/api-types"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { type Ref, useCallback, useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { FontAwesome, Ionicons } from "@expo/vector-icons"
import { LoadingSpinner } from "@/components/loading"

type TabType = "audio" | "subtitle"

export function TrackSelectorSheet({ ref }: { ref?: Ref<BottomSheet> }) {
  const [activeTab, setActiveTab] = useState<TabType>("audio")
  const { tracks, isLoading, setAudioTrack, setSubtitleTrack, isSettingTrack } =
    useTracks()

  const snapPoints = useMemo(() => ["50%", "75%"], [])

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  )

  const handleTrackSelect = useCallback(
    (trackId: number) => {
      if (activeTab === "audio") {
        setAudioTrack(trackId)
      } else {
        setSubtitleTrack(trackId)
      }
    },
    [activeTab, setAudioTrack, setSubtitleTrack]
  )

  const displayTracks = useMemo(() => {
    if (!tracks) return []
    return activeTab === "audio" ? tracks.audioTracks : tracks.subtitleTracks
  }, [activeTab, tracks])

  const currentTrackId = useMemo(() => {
    if (!tracks) return null
    if (activeTab === "audio") return tracks.audioTrack.id
    return tracks.subtitleTrack ? (tracks.subtitleTrack as TrackInfo).id : null
  }, [activeTab, tracks])

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      backdropComponent={backdrop}
      enablePanDownToClose
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Track Selector</Text>

        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === "audio" && styles.activeTab]}
            onPress={() => setActiveTab("audio")}
          >
            <Ionicons
              name="volume-medium"
              size={20}
              color={activeTab === "audio" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "audio" && styles.activeTabText,
              ]}
            >
              Audio
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tab, activeTab === "subtitle" && styles.activeTab]}
            onPress={() => setActiveTab("subtitle")}
          >
            <Ionicons
              name="logo-closed-captioning"
              size={20}
              color={
                activeTab === "subtitle" ? colors.primary : colors.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "subtitle" && styles.activeTabText,
              ]}
            >
              Subtitles
            </Text>
          </Pressable>
        </View>

        {isLoading ? (
          <LoadingSpinner size="large" message="Loading tracks..." />
        ) : (
          <BottomSheetFlatList
            data={displayTracks}
            keyExtractor={(item) => `${item.id}-${activeTab}`}
            renderItem={({ item }) => (
              <TrackItem
                track={item}
                isSelected={currentTrackId === item.id}
                onPress={() => handleTrackSelect(item.id)}
                isLoading={isSettingTrack}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  No {activeTab === "audio" ? "audio tracks" : "subtitles"}
                  available
                </Text>
              </View>
            }
          />
        )}
      </View>
    </BottomSheet>
  )
}

interface TrackItemProps {
  track: TrackInfo
  isSelected: boolean
  onPress: () => void
  isLoading: boolean
}

function TrackItem({ track, isSelected, onPress, isLoading }: TrackItemProps) {
  return (
    <Pressable
      style={[styles.trackItem, isSelected && styles.selectedTrackItem]}
      onPress={onPress}
      disabled={isLoading}
    >
      <View style={styles.trackInfo}>
        <Text
          style={[styles.trackTitle, isSelected && styles.selectedTrackTitle]}
        >
          {track.title}
        </Text>
        <View style={styles.trackMeta}>
          {track.lang && (
            <Text style={styles.trackMetaText}>{track.lang.toUpperCase()}</Text>
          )}
          {track.codec && (
            <Text style={styles.trackMetaText}>• {track.codec}</Text>
          )}
          {track.default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
            </View>
          )}
        </View>
      </View>

      {isSelected && (
        <FontAwesome name="check" size={20} color={colors.primary} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: "#1a1a1a",
  },
  handleIndicator: {
    backgroundColor: colors.textMuted,
    width: 40,
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  title: {
    ...defaultStyles.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginBottom: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  activeTab: {
    backgroundColor: "rgba(252, 60, 68, 0.15)",
  },
  tabText: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  activeTabText: {
    color: colors.primary,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  trackItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selectedTrackItem: {
    backgroundColor: "rgba(252, 60, 68, 0.1)",
    borderColor: colors.primary,
    opacity: 0.7,
  },
  trackInfo: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    fontWeight: "600",
    marginBottom: 4,
  },
  selectedTrackTitle: {
    color: colors.primary,
  },
  trackMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trackMetaText: {
    ...defaultStyles.text,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  defaultBadge: {
    backgroundColor: "rgba(252, 60, 68, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    ...defaultStyles.text,
    fontSize: 10,
    color: colors.primary,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
})
