import { colors, fontSize } from "@/lib/constants/tokens"
import { BlurView } from "expo-blur"
import { Tabs } from "expo-router"
import { StyleSheet, Platform } from "react-native"
import { FontAwesome } from "@expo/vector-icons"

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: "500",
        },
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          borderTopRightRadius: 20,
          borderTopLeftRadius: 20,
          borderTopWidth: 0,
          paddingTop: 8,
          backgroundColor:
            Platform.OS === "android" ? "rgba(0, 0, 0, 0.9)" : "transparent",
        },
        tabBarBackground: () => (
          <BlurView
            experimentalBlurMethod="dimezisBlurView"
            intensity={50}
            style={{
              ...StyleSheet.absoluteFillObject,
              overflow: "hidden",
              borderTopRightRadius: 20,
              borderTopLeftRadius: 20,
            }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="(shares)"
        options={{
          title: "Shares",
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="folder" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="gear" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
