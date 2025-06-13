import { StackScreen } from "@/lib/constants/layout"
import { defaultStyles } from "@/styles"
import { Stack } from "expo-router"
import { View } from "react-native"

export default function PlayerLayout() {
  return (
    <View style={defaultStyles.container}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            ...StackScreen,
            headerTitle: "Now Playing",
            headerLargeTitle: false,
            headerTransparent: true,
            headerBlurEffect: "prominent",
          }}
        />
      </Stack>
    </View>
  )
}
