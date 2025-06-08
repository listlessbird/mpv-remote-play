import { TracksList } from "@/components/tracks-list"
import { useNavSearch } from "@/hooks/use-nav-search"
import { screenPadding } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { View, Text, StyleSheet, ScrollView } from "react-native"
import mock from "@assets/data/mock.json"
import { useMemo } from "react"

export default function HomeScreen() {
  const search = useNavSearch({
    searchbarOptions: {
      placeholder: "Search",
    },
  })

  const filteredTracks = useMemo(() => {
    if (!search) return mock
    return mock.filter((track) =>
      track.title.toLowerCase().includes(search.toLowerCase())
    )
  }, [search])

  return (
    <View style={defaultStyles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{
          paddingHorizontal: screenPadding.x,
        }}
      >
        <TracksList scrollEnabled={false} tracks={filteredTracks} />
      </ScrollView>
    </View>
  )
}
