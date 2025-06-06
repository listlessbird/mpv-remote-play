import { defaultStyles } from "@/styles"
import { StackScreen } from "@/lib/constants/layout"
import { Stack } from "expo-router"
import { View } from "react-native"

export default function HomeLayout() {
  return (
    <View style={defaultStyles.container}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            ...StackScreen,
            headerTitle: "Home",
          }}
        />
      </Stack>
    </View>
  )
}
