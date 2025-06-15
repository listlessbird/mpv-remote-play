import { defaultStyles } from "@/styles"
import { StackScreen } from "@/lib/constants/layout"
import { Stack } from "expo-router"
import { View } from "react-native"
import { SharesScreen } from "@/screens/shares-screen"
import { colors } from "@/lib/constants/tokens"

export default function HomeLayout() {
  return (
    <View style={defaultStyles.container}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            ...StackScreen,
            headerTitle: "Shares",
          }}
        />
        <Stack.Screen
          name="[shareName]"
          options={{
            headerTitle: "",
            headerBackVisible: true,
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.primary,
          }}
        />
        <Stack.Screen
          name="[shareName]/[...path]"
          options={{
            headerTitle: "",
            headerBackVisible: true,
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.primary,
          }}
        />
      </Stack>
    </View>
    // <SharesScreen />
  )
}
