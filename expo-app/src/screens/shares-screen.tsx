import { QueryError } from "@/components/error-boundary"
import { LoadingSpinner } from "@/components/loading"
import { colors, fontSize, screenPadding } from "@/lib/constants/tokens"
import { useServerStatus, useShares } from "@/lib/queries"
import { defaultStyles, utilStyles } from "@/styles"
import { useRouter } from "expo-router"
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  TouchableHighlight,
} from "react-native"
import type { FlatListProps, TouchableHighlightProps } from "react-native"
import { AntDesign, FontAwesome } from "@expo/vector-icons"
import { useNavSearch } from "@/hooks/use-nav-search"
import { useMemo } from "react"
import { ConnectionStatus } from "@/components/connection-status"

const ListItemSeperator = () => (
  <View
    style={{
      ...utilStyles.ItemSeparator,
      marginLeft: 80,
      marginVertical: 12,
    }}
  />
)

export function SharesScreen() {
  const router = useRouter()
  const { data: shares, isLoading, error, refetch, isRefetching } = useShares()
  const { data: status } = useServerStatus()
  const search = useNavSearch({
    searchbarOptions: {
      placeholder: "Find in shares",
    },
  })

  const filteredShares = useMemo(() => {
    if (!search) return shares?.shares || []

    return (
      shares?.shares.filter((share) =>
        share.toLowerCase().includes(search.toLowerCase())
      ) || []
    )
  }, [search, shares?.shares])

  const handleSharePress = (shareName: string) => {
    router.push(`/${shareName}`)
  }

  return (
    <View style={defaultStyles.container}>
      {/* {status && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {status.stats.totalFiles} files • {status.stats.totalDirectories}{" "}
            folder(s)
          </Text>
        </View>
      )} */}
      <ConnectionStatus />

      <ScrollView
        style={{
          paddingHorizontal: screenPadding.x,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <SharesList
          scrollEnabled={false}
          shares={filteredShares}
          onSharePress={handleSharePress}
          isRefetching={isRefetching}
          isLoading={isLoading}
          error={error}
          refetch={refetch}
        />

        {/* */}
      </ScrollView>
    </View>
  )
}

function SharesList({
  shares,
  onSharePress,
  isRefetching,
  isLoading,
  error,
  refetch,
  ...flatListProps
}: {
  shares: string[]
  onSharePress: (shareName: string) => void
  isRefetching: boolean
  isLoading: boolean
  error: Error | null
  refetch: () => void
} & Partial<FlatListProps<string>>) {
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner message="Loading shares..." />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Failed to load shares</Text>
        <Text style={styles.errorMessage}>
          Unable to connect to the server. Please check your backend URL in
          settings and try again.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <FlatList
      data={shares}
      keyExtractor={(item) => item}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => (
        <ShareItem shareName={item} onPress={() => onSharePress(item)} />
      )}
      ItemSeparatorComponent={ListItemSeperator}
      ListFooterComponent={() => <ListItemSeperator />}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <Text style={utilStyles.emptyContentText}>No shares available</Text>
        </View>
      )}
      {...flatListProps}
    />
  )
}

function ShareItem({
  shareName,
  onPress,
  ...touchableHighlightProps
}: {
  shareName: string
  onPress: () => void
} & TouchableHighlightProps) {
  return (
    <TouchableHighlight
      activeOpacity={0.8}
      style={styles.shareItem}
      onPress={onPress}
      {...touchableHighlightProps}
    >
      {/* <View style={styles.shareIcon}>
        <FontAwesome name="folder" size={24} color={colors.primary} />
      </View>
      <View style={styles.shareContent}>
        <Text style={styles.shareName}>{shareName}</Text>
        <Text style={styles.shareSubtext}>Media Share</Text>
      </View>
      <FontAwesome name="chevron-right" size={12} color={colors.textMuted} /> */}
      <View style={styles.shareItem}>
        <View>
          <View style={styles.shareIcon}>
            <FontAwesome name="folder" size={24} color={colors.primary} />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Text style={styles.shareName} numberOfLines={1}>
            {shareName}
          </Text>
          <AntDesign
            name="right"
            size={16}
            color={colors.icon}
            style={{
              opacity: 0.5,
            }}
          />
        </View>
      </View>
    </TouchableHighlight>
  )
}

const styles = StyleSheet.create({
  statsContainer: {
    paddingHorizontal: screenPadding.x,
    paddingVertical: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.textMuted,
  },
  statsText: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
  },
  listContainer: {
    paddingTop: 10,
    paddingBottom: 128,
  },
  loadingContainer: {
    paddingVertical: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    paddingVertical: 64,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
    color: colors.text,
  },
  errorMessage: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  shareItem: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
    paddingRight: 80,
  },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(252,60,68,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  shareContent: {
    flex: 1,
  },
  shareName: {
    ...defaultStyles.text,
    fontSize: 17,
    fontWeight: "600",
    textTransform: "capitalize",
    maxWidth: "90%",
  },
  shareSubtext: {
    ...defaultStyles.text,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
})
