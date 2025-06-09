import { colors, fontSize } from "@/lib/constants/tokens"
import { defaultStyles } from "@/styles"
import { StyleSheet, View } from "react-native"

interface SkeletonProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: any
}

export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 4,
  style,
}: SkeletonProps) {
  return (
    <View style={[styles.skeleton, { width, height, borderRadius }, style]} />
  )
}

export function TrackSkeleton() {
  return (
    <View style={styles.trackSkeletonContainer}>
      <Skeleton width={50} height={50} borderRadius={8} />
      <View style={styles.trackSkeletonContent}>
        <Skeleton width="70%" height={16} style={{ marginBottom: 8 }} />
        <Skeleton width="40%" height={14} />
      </View>
    </View>
  )
}

export function TracksListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.tracksListSkeleton}>
      {Array.from({ length: count }).map((_, index) => (
        <TrackSkeleton key={index} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.textMuted,
    opacity: 0.3,
  },
  trackSkeletonContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    columnGap: 14,
  },
  trackSkeletonContent: {
    flex: 1,
  },
  tracksListSkeleton: {
    paddingTop: 10,
  },
})
