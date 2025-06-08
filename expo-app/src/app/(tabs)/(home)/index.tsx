import { TracksList } from "@/components/tracks-list"
import { screenPadding } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { View, Text, StyleSheet, ScrollView } from "react-native"

export default function HomeScreen() {
  return (
    <View style={defaultStyles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{
          paddingHorizontal: screenPadding.x,
        }}
      >
        <TracksList scrollEnabled={false} />
      </ScrollView>
    </View>
  )
}
