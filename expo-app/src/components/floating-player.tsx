import { unknownVideoImageUri } from "@/lib/constants/images"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { Image } from "expo-image"
import { useMemo } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
  ViewProps,
} from "react-native"
import TrackPlayer, {
  useActiveTrack,
  useIsPlaying,
} from "react-native-track-player"
import { FontAwesome, FontAwesome6 } from "@expo/vector-icons"

type PlayerControlsProps = {
  style?: ViewStyle
}

type PlayerButtonProps = {
  style?: ViewStyle
  iconSize?: number
}

function PlayPauseButton({ iconSize, style }: PlayerButtonProps) {
  const { playing } = useIsPlaying()

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())}
      >
        <FontAwesome
          name={playing ? "pause" : "play"}
          size={iconSize}
          color={colors.text}
        />
      </TouchableOpacity>
    </View>
  )
}

function SkipToPreviousButton({ iconSize = 30, style }: PlayerButtonProps) {
  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => TrackPlayer.skipToPrevious()}
      >
        <FontAwesome6 name="backward" size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

function SkipToNextButton({ iconSize = 30, style }: PlayerButtonProps) {
  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => TrackPlayer.skipToPrevious()}
      >
        <FontAwesome6 name="forward" size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

function StopButton({ iconSize = 30, style }: PlayerButtonProps) {
  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => TrackPlayer.stop()}>
        <FontAwesome6 name="stop" size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

export function FloatingPlayer({ style }: ViewProps) {
  const activeTrack = useActiveTrack()

  const displayedTrack = useMemo(() => {
    const sample = {
      title: "Sample Track",
    }

    return sample
  }, [activeTrack])

  if (!displayedTrack) return null

  return (
    <TouchableOpacity activeOpacity={0.9} style={[styles.container, style]}>
      <>
        <Image
          source={{
            uri: displayedTrack.artwork ?? unknownVideoImageUri,
          }}
          style={styles.trackArtwork}
        />
        <View style={styles.trackTitleContainer}>
          <Text style={styles.trackTitle}>{displayedTrack.title}</Text>
        </View>

        <View style={styles.trackControlsContainer}>
          {/* <SkipToPreviousButton iconSize={22} /> */}
          <StopButton iconSize={22} />
          <PlayPauseButton iconSize={22} />
          <SkipToNextButton iconSize={22} />
        </View>
      </>
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
    fontSize: 18,
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
