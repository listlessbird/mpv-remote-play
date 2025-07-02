import { FloatingPlayer } from "@/components/floating-player"
import { colors, fontSize } from "@/lib/constants/tokens"
import { FontAwesome, FontAwesome6 } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import { Tabs, usePathname, useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { Platform, StyleSheet } from "react-native"
import TrackPlayer, {
  type Track,
  useActiveTrack,
} from "react-native-track-player"

export default function TabLayout() {
  const activeTrack = useActiveTrack()

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const router = useRouter()

  useEffect(() => {
    const loadCurrentTrack = async () => {
      const index = await TrackPlayer.getActiveTrackIndex()
      const queue = await TrackPlayer.getQueue()

      if (typeof index === "number" && queue[index]) {
        setCurrentTrack(queue[index])
      }
    }

    loadCurrentTrack()

    const interval = setInterval(loadCurrentTrack, 1000)
    return () => clearInterval(interval)
  }, [])

  const displayTrack = currentTrack || activeTrack

  const pathname = usePathname()

  return (
    <>
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
          name="player"
          options={{
            title: "Player",
            tabBarIcon: ({ color, size }) => (
              <FontAwesome6 name="circle-play" size={size} color={color} />
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
      {/* <FloatingPlayer
        style={{
          position: "absolute",
          bottom: 78,
          left: 8,
          right: 8,
        }}
      /> */}
    </>
  )
}
