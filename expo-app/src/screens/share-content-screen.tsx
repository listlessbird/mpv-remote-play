import { QueryError } from "@/components/error-boundary"
import { ShareTracksList } from "@/components/share-tracks-list"
import { TracksListSkeleton } from "@/components/skeletons"
import { useNavSearch } from "@/hooks/use-nav-search"
import { screenPadding } from "@/lib/constants/tokens"
import { useShareContents } from "@/lib/queries"
import { defaultStyles } from "@/styles"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useMemo } from "react"
import { ScrollView, View } from "react-native"

export function ShareContentScreen() {
  const { shareName, path } = useLocalSearchParams<{
    shareName: string
    path: string
  }>()

  const router = useRouter()

  const decodedPath = path ? decodeURIComponent(path) : undefined

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
    router.push(`/[shareName]/${encodeURIComponent(newPath)}`)
  }

  //   TODO: handleFileClick

  if (isLoading) {
    return (
      <View style={defaultStyles.container}>
        <TracksListSkeleton />
      </View>
    )
  }

  if (error) {
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

  console.log(data)

  return (
    <View style={defaultStyles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ paddingHorizontal: screenPadding.x }}
      >
        <ShareTracksList
          contents={data}
          onDirectoryPress={handleDirectoryPress}
          onFilePress={null}
        />
      </ScrollView>
    </View>
  )
}
