import { useTracks } from "@/hooks/use-tracks"
import type { TrackInfo } from "@/lib/api/api-types"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import {
  type Ref,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react"
import { Pressable, StyleSheet, Text, View, Animated } from "react-native"
import { FontAwesome, Ionicons } from "@expo/vector-icons"
import { LoadingSpinner } from "@/components/loading"

type TabType = "audio" | "subtitle"

function AnimatedLoadingDots() {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [opacity])

  return (
    <Animated.Text style={[styles.loadingText, { opacity }]}>●●●</Animated.Text>
  )
}

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
                isSelected={item.selected}
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
      style={({ pressed }) => [
        styles.trackItem,
        isSelected && styles.selectedTrackItem,
        isLoading && styles.loadingTrackItem,
        pressed && styles.pressedTrackItem,
      ]}
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
            <Text
              style={[
                styles.trackMetaText,
                isSelected && styles.selectedTrackMeta,
              ]}
            >
              {track.lang.toUpperCase()}
            </Text>
          )}
          {track.codec && (
            <Text
              style={[
                styles.trackMetaText,
                isSelected && styles.selectedTrackMeta,
              ]}
            >
              • {track.codec}
            </Text>
          )}
          {track.default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
            </View>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingIndicator}>
          <AnimatedLoadingDots />
        </View>
      ) : isSelected ? (
        <View style={styles.selectedIndicator}>
          <FontAwesome
            name="check"
            size={18}
            color="rgba(255, 255, 255, 0.9)"
          />
        </View>
      ) : null}
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
    paddingBottom: 100,
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
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
    color: "#ffffff",
    fontWeight: "700",
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
  loadingTrackItem: {
    opacity: 0.6,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  loadingIndicator: {
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    ...defaultStyles.text,
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: fontSize.sm,
    fontWeight: "600",
    letterSpacing: 2,
  },
  selectedTrackMeta: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  pressedTrackItem: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    transform: [{ scale: 0.98 }],
  },
  selectedIndicator: {
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
})
