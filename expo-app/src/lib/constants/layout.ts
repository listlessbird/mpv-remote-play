import { colors } from "@/lib/constants/tokens"
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack"

export const StackScreen: NativeStackNavigationOptions = {
  headerLargeTitle: true,
  headerLargeStyle: {
    backgroundColor: colors.background,
  },
  headerLargeTitleStyle: {
    color: colors.text,
  },
  headerTintColor: colors.text,
  headerTransparent: true,
  headerBlurEffect: "prominent",
  headerShadowVisible: false,
}
