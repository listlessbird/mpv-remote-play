import {
  FlatList,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
  RefreshControl,
} from "react-native"
import type { FlatListProps, TouchableHighlightProps } from "react-native"
import { Image } from "expo-image"
import { unknownVideoImageUri } from "@/lib/constants/images"
import { colors, fontSize, screenPadding } from "@/lib/constants/tokens"
import { defaultStyles, utilStyles } from "@/styles"
import type { ShareContents, Track } from "@/lib/api/api-types"
import { AntDesign, FontAwesome } from "@expo/vector-icons"

type ContentItem =
  | { type: "directory"; name: string }
  | { type: "file"; track: Track }

const ListItemSeperator = () => (
  <View
    style={{
      ...utilStyles.ItemSeparator,
      marginLeft: 80,
      marginVertical: 12,
    }}
  />
)

export function ShareTracksList({
  contents,
  onDirectoryPress,
  onFilePress,
}: {
  contents: ShareContents
  onDirectoryPress: (dirName: string) => void
  onFilePress: ((file: Track) => void) | null
}) {
  const items: ContentItem[] = [
    ...contents.directories.map((dir) => ({
      type: "directory" as const,
      name: dir,
    })),
    ...contents.files.map((file) => ({ type: "file" as const, track: file })),
  ]

  return (
    <FlatList
      scrollEnabled={false}
      data={items}
      keyExtractor={(item, index) =>
        item.type === "directory" ? `dir-${item.name}` : `file-${item.track.id}`
      }
      contentContainerStyle={styles.listContainer}
      renderItem={({ item }) => {
        if (item.type === "directory") {
          return (
            <DirectoryItem
              directoryName={item.name}
              onPress={() => onDirectoryPress(item.name)}
            />
          )
        }
        return (
          <FileItem
            track={item.track}
            onPress={onFilePress ? () => onFilePress(item.track) : undefined}
          />
        )
      }}
      ItemSeparatorComponent={ListItemSeperator}
      ListFooterComponent={() => <ListItemSeperator />}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <Text style={utilStyles.emptyContentText}>No content available</Text>
        </View>
      )}
    />
  )
}

function DirectoryItem({
  directoryName,
  onPress,
  ...touchableHighlightProps
}: {
  directoryName: string
  onPress: () => void
} & TouchableHighlightProps) {
  return (
    <TouchableHighlight
      activeOpacity={0.8}
      style={styles.contentItem}
      onPress={onPress}
      {...touchableHighlightProps}
    >
      <View style={styles.contentItem}>
        <View>
          <View style={styles.directoryIcon}>
            <FontAwesome name="folder" size={24} color={colors.primary} />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Text style={styles.directoryName} numberOfLines={1}>
            {directoryName}
          </Text>
          <AntDesign
            name="right"
            size={16}
            color={colors.icon}
            style={{
              opacity: 0.5,
            }}
          />
        </View>
      </View>
    </TouchableHighlight>
  )
}

function FileItem({ track, onPress }: { track: Track; onPress?: () => void }) {
  const isActive = false
  console.log(track)

  return (
    <TouchableHighlight
      activeOpacity={0.8}
      style={styles.contentItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.fileItemContainer}>
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
  listContainer: {
    paddingTop: 10,
    paddingBottom: 128,
  },
  contentItem: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
    paddingRight: 80,
  },
  directoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(252,60,68,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  directoryName: {
    ...defaultStyles.text,
    fontSize: 17,
    fontWeight: "600",
    maxWidth: "90%",
  },
  fileItemContainer: {
    flexDirection: "row",
    columnGap: 14,
    alignItems: "center",
    paddingRight: 20,
  },
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
})
