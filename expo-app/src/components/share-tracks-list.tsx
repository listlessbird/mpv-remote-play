import { TracksList } from "@/components/tracks-list"
import type { ShareContents } from "@/lib/api/api-types"
import type { Track } from "@/lib/api/api-types"
import { fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { StyleSheet } from "react-native"

export function ShareTracksList({
  contents,
  onDirectoryPress,
  onFilePress,
}: {
  contents: ShareContents
  onDirectoryPress: (dirName: string) => void
  onFilePress: (file: Track) => void
}) {
  return (
    <TracksList
      scrollEnabled={false}
      id="share-tracks"
      ListHeaderComponentStyle={styles.sharelistHeaderContainer}
      tracks={contents.files}
    />
  )
}

const styles = StyleSheet.create({
  sharelistHeaderContainer: {
    flex: 1,
    marginBottom: 32,
  },
  sharelistNameText: {
    ...defaultStyles.text,
    marginTop: 22,
    fontSize: fontSize.lg,
    fontWeight: "600",
  },
})
