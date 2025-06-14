import { ConnectionStatus } from "@/components/connection-status"
import { QueryError } from "@/components/error-boundary"
import { NetworkError } from "@/components/network-error"
import { ShareTracksList } from "@/components/share-tracks-list"
import { TracksListSkeleton } from "@/components/skeletons"
import { useConnectionStats } from "@/hooks/use-connection-stats"
import { useNavSearch } from "@/hooks/use-nav-search"
import { apiClient } from "@/lib/api/api-client"
import type { Track } from "@/lib/api/api-types"
import { screenPadding } from "@/lib/constants/tokens"
import { useShareContents } from "@/lib/queries"
import { useMPVInstanceStore } from "@/store/mpv-instance"
import { usePlaylistStore } from "@/store/playlist"
import { defaultStyles } from "@/styles"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useMemo } from "react"
import { Alert, ScrollView, View } from "react-native"
import TrackPlayer from "react-native-track-player"

export function ShareContentScreen() {
  const { shareName, path } = useLocalSearchParams<{
    shareName: string
    path: string | string[]
  }>()
  const router = useRouter()

  const { isConnected, errorType, lastError } = useConnectionStats()
  const { setPlaylist, loadPlaylistToPlayer } = usePlaylistStore()
  const { setActiveInstance, activeInstance } = useMPVInstanceStore()

  const decodedPath = useMemo(() => {
    if (!path) return undefined

    if (Array.isArray(path)) {
      return path.map((seg) => decodeURIComponent(seg)).join("/")
    }
    return decodeURIComponent(path)
  }, [path])

  // console.log({ decodedPath })

  const {
    data: contents,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useShareContents(shareName, decodedPath)

  const search = useNavSearch({
    searchbarOptions: {
      placeholder: "Search Media...",
      hideWhenScrolling: true,
    },
  })

  const filteredContents = useMemo(() => {
    if (!contents || !search) return contents

    return {
      ...contents,
      files: contents.files.filter((f) =>
        f.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ),
      directories: contents.directories.filter((d) =>
        d.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ),
    }
  }, [contents, search])

  const handleDirectoryPress = (dirName: string) => {
    const newPath = decodedPath ? `${decodedPath}/${dirName}` : dirName
    router.push(`/${shareName}/${encodeURIComponent(newPath)}`)
  }

  //   TODO: handleFileClick

  const handleFilePress = useCallback(
    async (file: Track) => {
      console.log(file)

      if (!isConnected) {
        Alert.alert(
          "No connection",
          "Please connect to the proper network to play this file",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Retry",
              onPress: () => {
                refetch()
              },
            },
          ]
        )
        return
      }

      try {
        const allFiles = filteredContents?.files || []
        const fileIndex = allFiles.findIndex((f) => f.id === file.id)
        console.log(
          `Setting playlist with ${allFiles.length} files, starting at index ${fileIndex}`
        )

        setPlaylist(allFiles, fileIndex >= 0 ? fileIndex : 0)
        await loadPlaylistToPlayer()

        await new Promise((resolve) => setTimeout(resolve, 1000))

        if (fileIndex > 0) {
          await TrackPlayer.skip(fileIndex)
        }

        await TrackPlayer.play()

        try {
          if (activeInstance) {
            await apiClient.sendMPVCommand(activeInstance.id, {
              action: "loadfile",
              params: { file: file.src, mode: "replace" },
            })
          } else {
            const { instanceId } = await apiClient.createMPVInstance(file.src)
            setActiveInstance({
              id: instanceId,
              status: "running",
              lastSeen: new Date().toISOString(),
            })
          }
        } catch (mpvError) {
          console.error("MPV sync failed when selecting file", mpvError)
        }

        router.push("/player")
      } catch (error) {
        console.error(error)
      }
    },
    [
      isConnected,
      filteredContents,
      refetch,
      activeInstance,
      setActiveInstance,
      router,
      setPlaylist,
      loadPlaylistToPlayer,
    ]
  )

  if (!isConnected && lastError) {
    return (
      <NetworkError
        error={lastError}
        type={errorType || "unknown"}
        onRetry={refetch}
      />
    )
  }

  if (isLoading) {
    return (
      <View style={defaultStyles.container}>
        <TracksListSkeleton />
      </View>
    )
  }

  if (error) {
    const isNetworkError =
      error.message.toLowerCase().includes("network") ||
      error.message.toLowerCase().includes("fetch")

    if (isNetworkError) {
      return (
        <NetworkError
          error={error as Error}
          type="connection"
          onRetry={refetch}
        />
      )
    }
    return (
      <QueryError
        error={error}
        onRetry={refetch}
        message="Failed to load contents"
      />
    )
  }
  // @ts-ignore
  //   biome-ignore lint/style/noNonNullAssertion: contents is not null
  const data = filteredContents || contents!

  return (
    <View style={defaultStyles.container}>
      <ConnectionStatus />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ paddingHorizontal: screenPadding.x }}
      >
        <ShareTracksList
          contents={data}
          onDirectoryPress={handleDirectoryPress}
          onFilePress={handleFilePress}
        />
      </ScrollView>
    </View>
  )
}
