import { usePlayerCommands } from "@/hooks/use-player-commands"
import { useTrackSync } from "@/hooks/use-track-sync"
import { unknownVideoImageUri } from "@/lib/constants/images"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { TrackSelectorSheet } from "@/components/track-selector-sheet"
import type BottomSheet from "@gorhom/bottom-sheet"
import { useRef } from "react"
import Slider from "@react-native-community/slider"
import { Image } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { useCallback, useEffect, useState } from "react"
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import TrackPlayer, {
  useActiveTrack,
  useIsPlaying,
  useProgress,
} from "react-native-track-player"
import {
  FontAwesome,
  FontAwesome6,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons"
import type { Track } from "react-native-track-player"

const { width: screenWidth, height: screenHeight } = Dimensions.get("window")

export function PlayerScreen() {
  const activeTrack = useActiveTrack()
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const { playing: trackPlayerPlaying } = useIsPlaying()
  const { position: trackPlayerPosition, duration: trackPlayerDuration } =
    useProgress()
  const { mpvState } = useTrackSync()
  const insets = useSafeAreaInsets()
  const {
    play,
    pause,
    stop,
    seek,
    setVolume,
    skipToNext,
    skipToPrevious,
    isLoading,
    activeInstance,
  } = usePlayerCommands()

  const playing = mpvState ? !mpvState.paused : trackPlayerPlaying
  const position = mpvState?.position ?? trackPlayerPosition
  const duration = mpvState?.duration ?? trackPlayerDuration

  const bottomSheetRef = useRef<BottomSheet>(null)

  const [volume, setVolumeState] = useState(0.5)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekPosition, setSeekPosition] = useState(0)

  // active track from rn-track-player is not updated when the track changes
  // so poll for changes
  useEffect(() => {
    const loadCurrentTrack = async () => {
      const index = await TrackPlayer.getActiveTrackIndex()
      const queue = await TrackPlayer.getQueue()

      if (typeof index === "number" && queue[index]) {
        setCurrentTrack(queue[index])
      }
    }

    loadCurrentTrack()

    const interval = setInterval(loadCurrentTrack, 1000)
    return () => clearInterval(interval)
  }, [])

  const handlePlayPause = useCallback(() => {
    if (playing) {
      pause()
    } else {
      play()
    }
  }, [playing, play, pause])

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true)
    setSeekPosition(position)
  }, [position])

  const handleSeekChange = useCallback((position: number) => {
    setSeekPosition(position)
  }, [])

  const handleSeekEnd = useCallback(
    (position: number) => {
      setIsSeeking(false)
      seek(position)
    },
    [seek]
  )

  const handleVolumeChange = useCallback(
    (value: number) => {
      setVolumeState(value)
      setVolume(value * 100)
    },
    [setVolume]
  )

  const handleTrackSelectorOpen = useCallback(() => {
    bottomSheetRef.current?.expand()
  }, [])

  useEffect(() => {
    if (activeTrack) {
      console.log("Active track changed:", activeTrack.title)
    }
  }, [activeTrack])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const displayPosition = isSeeking ? seekPosition : position
  const displayTrack = currentTrack || activeTrack

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: insets.top + 60 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.artworkSection}>
          <View style={styles.artworkContainer}>
            <Image
              source={{ uri: displayTrack?.artwork || unknownVideoImageUri }}
              style={styles.artwork}
              contentFit="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(0, 0, 0, 0.8)"]}
              style={styles.artworkGradient}
            />
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.title} numberOfLines={2}>
            {displayTrack?.title || "No Track Playing"}
          </Text>
          {displayTrack?.artist && (
            <Text style={styles.artist} numberOfLines={1}>
              {displayTrack?.artist}
            </Text>
          )}
        </View>

        <View style={styles.progressSection}>
          <Slider
            style={styles.progressSlider}
            value={displayPosition}
            minimumValue={0}
            maximumValue={duration}
            onSlidingStart={handleSeekStart}
            onValueChange={handleSeekChange}
            onSlidingComplete={handleSeekEnd}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={"rgba(255, 255, 255, 0.15)"}
            thumbTintColor={colors.primary}
          />
          <View style={styles.timeLabels}>
            <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controlsSection}>
          <Pressable
            onPress={skipToPrevious}
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
          >
            <View style={styles.controlButtonInner}>
              <FontAwesome6
                name="backward-step"
                size={28}
                color={colors.text}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={handlePlayPause}
            style={({ pressed }) => [
              styles.playPauseButton,
              pressed && styles.playPauseButtonPressed,
            ]}
          >
            <LinearGradient
              colors={[colors.primary, "#e63946"]}
              style={styles.playPauseGradient}
            >
              <FontAwesome
                name={playing ? "pause" : "play"}
                size={36}
                color="#ffffff"
                style={playing ? {} : { marginLeft: 4 }}
              />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={skipToNext}
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
          >
            <View style={styles.controlButtonInner}>
              <FontAwesome6 name="forward-step" size={28} color={colors.text} />
            </View>
          </Pressable>
        </View>

        <View style={styles.secondaryControls}>
          <Pressable
            onPress={stop}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <View style={styles.secondaryButtonInner}>
              <FontAwesome6 name="stop" size={20} color={colors.textMuted} />
            </View>
          </Pressable>

          <View style={styles.volumeContainer}>
            <View style={styles.volumeIconContainer}>
              <Ionicons
                name={volume > 0 ? "volume-medium" : "volume-mute"}
                size={20}
                color={colors.textMuted}
              />
            </View>
            <Slider
              style={styles.volumeSlider}
              value={volume}
              minimumValue={0}
              maximumValue={1}
              onValueChange={handleVolumeChange}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={"rgba(255, 255, 255, 0.15)"}
              thumbTintColor={colors.primary}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleTrackSelectorOpen}
          >
            <View style={styles.secondaryButtonInner}>
              <MaterialCommunityIcons
                name="playlist-music"
                size={20}
                color={colors.textMuted}
              />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <TrackSelectorSheet ref={bottomSheetRef} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  artworkSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  artworkContainer: {
    width: screenWidth * 0.8,
    height: screenWidth * 0.8,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "30%",
  },
  infoSection: {
    alignItems: "center",
    marginBottom: 36,
  },
  title: {
    ...defaultStyles.text,
    fontSize: fontSize.lg,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: fontSize.lg * 1.2,
  },
  artist: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: "center",
    fontWeight: "500",
  },
  progressSection: {
    marginBottom: 44,
  },
  progressSlider: {
    width: "100%",
    height: 44,
  },
  timeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
    paddingHorizontal: 4,
  },
  timeText: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: "600",
  },
  controlsSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 52,
    gap: 32,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonInner: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  controlButtonPressed: {
    transform: [{ scale: 0.92 }],
  },
  playPauseButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  playPauseGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  playPauseButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  secondaryControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonInner: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  secondaryButtonPressed: {
    transform: [{ scale: 0.9 }],
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginHorizontal: 20,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  volumeIconContainer: {
    marginRight: 12,
  },
  volumeSlider: {
    flex: 1,
    height: 32,
  },
})
