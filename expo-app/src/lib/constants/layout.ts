import { colors } from "@/lib/constants/tokens"
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack"
import { Platform } from "react-native"

export const StackScreen: NativeStackNavigationOptions = {
  headerLargeTitle: true,
  headerLargeStyle: {
    backgroundColor: colors.background,
  },
  headerLargeTitleStyle: {
    color: colors.text,
  },
  headerTintColor: colors.text,
  headerTransparent: Platform.OS === "ios",
  headerBlurEffect: Platform.OS === "ios" ? "prominent" : undefined,
  headerShadowVisible: false,
  headerStyle:
    Platform.OS === "android"
      ? {
          backgroundColor: colors.background,
        }
      : undefined,
}
