import React from "react"
import { unknownVideoImageUri } from "@/lib/constants/images"
import { colors } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { Image } from "expo-image"
import { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
  type ViewProps,
} from "react-native"
import TrackPlayer, {
  useActiveTrack,
  useIsPlaying,
  type Track,
} from "react-native-track-player"
import { FontAwesome, FontAwesome6 } from "@expo/vector-icons"
import { usePlayerCommands } from "@/hooks/use-player-commands"
import { useTrackSync } from "@/hooks/use-track-sync"
import { useRouter, usePathname } from "expo-router"

type PlayerButtonProps = {
  style?: ViewStyle
  iconSize?: number
}

function PlayPauseButton({ iconSize, style }: PlayerButtonProps) {
  const { playing } = useIsPlaying()
  const { mpvState } = useTrackSync()
  const { play, pause } = usePlayerCommands()

  const isPlaying = mpvState ? !mpvState.paused : playing

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => (isPlaying ? pause() : play())}
      >
        <FontAwesome
          name={isPlaying ? "pause" : "play"}
          size={iconSize}
          color={colors.text}
        />
      </TouchableOpacity>
    </View>
  )
}

function SkipToNextButton({ iconSize = 30, style }: PlayerButtonProps) {
  const { skipToNext } = usePlayerCommands()

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => skipToNext()}>
        <FontAwesome6 name="forward" size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

function StopButton({ iconSize = 30, style }: PlayerButtonProps) {
  const { stop } = usePlayerCommands()

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => stop()}>
        <FontAwesome6 name="stop" size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

export function FloatingPlayer({ style }: ViewProps) {
  const activeTrack = useActiveTrack()
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const router = useRouter()
  const pathname = usePathname()

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

  const displayTrack = currentTrack || activeTrack

  const handlePress = useCallback(() => {
    router.push("/player")
  }, [router])

  if (!displayTrack || pathname === "/player") return null

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.container, style]}
      onPress={handlePress}
    >
      <Image
        source={{
          uri: displayTrack.artwork ?? unknownVideoImageUri,
        }}
        style={styles.trackArtwork}
      />
      <View style={styles.trackTitleContainer}>
        <Text style={styles.trackTitle} numberOfLines={2}>
          {displayTrack.title || "Unknown Track"}
        </Text>
      </View>

      <View style={styles.trackControlsContainer}>
        <StopButton iconSize={22} />
        <PlayPauseButton iconSize={22} />
        <SkipToNextButton iconSize={22} />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252525",
    borderRadius: 12,
    padding: 10,
    shadowColor: colors.text,
  },
  trackArtwork: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  trackTitle: {
    ...defaultStyles.text,
    fontSize: 14,
    paddingLeft: 10,
    fontWeight: "600",
  },
  trackTitleContainer: {
    flex: 1,
    overflow: "hidden",
    marginLeft: 10,
  },
  trackControlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 20,
    marginRight: 16,
    paddingLeft: 16,
  },
})
