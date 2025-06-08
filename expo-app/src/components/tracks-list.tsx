import {
  FlatList,
  FlatListProps,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from "react-native"
import mock from "@assets/data/mock.json"
import { Image } from "expo-image"
import { unknownVideoImageUri } from "@/lib/constants/images"
import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles, utilStyles } from "@/styles"

type Track = {
  id: string
  src: string
  title: string
  thumbnail: string
  duration: number
  playlist?: string
}

type TracksListProps = Partial<FlatListProps<Track>>

function ItemSeparator() {
  return (
    <View
      style={{ ...utilStyles.ItemSeparator, marginVertical: 9, marginLeft: 60 }}
    />
  )
}

export function TracksList({ ...props }: TracksListProps) {
  return (
    <FlatList
      data={mock}
      renderItem={({ item }) => <TrackListItem track={item} />}
      ItemSeparatorComponent={ItemSeparator}
      {...props}
    />
  )
}

type TrackListItemProps = {
  track: Track
}

function TrackListItem({ track }: TrackListItemProps) {
  const isActive = false
  console.log(track)
  return (
    <TouchableHighlight>
      <View style={styles.trackItemContainer}>
        <View>
          <Image
            source={{
              uri: track.thumbnail ?? unknownVideoImageUri,
            }}
            style={{
              ...styles.trackArtworkImage,
              opacity: isActive ? 0.6 : 1,
            }}
          />
        </View>
        <View style={{ width: "100%" }}>
          <Text
            numberOfLines={1}
            style={{
              ...styles.trackTitleText,
              color: isActive ? colors.primary : colors.text,
            }}
          >
            {track.title}
          </Text>
          {track.duration > 0 && (
            <Text numberOfLines={1} style={styles.trackDurationText}>
              {formatDuration(track.duration)}
            </Text>
          )}
        </View>
      </View>
    </TouchableHighlight>
  )
}

function formatDuration(duration: number) {
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

const styles = StyleSheet.create({
  trackArtworkImage: {
    borderRadius: 8,
    width: 50,
    height: 50,
  },
  trackTitleText: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    fontWeight: "600",
    maxWidth: "90%",
  },
  trackDurationText: {
    ...defaultStyles.text,
    fontSize: 14,
    color: colors.textMuted,
  },
  trackItemContainer: {
    flexDirection: "row",
    columnGap: 14,
    alignItems: "center",
    paddingRight: 20,
  },
})
