import { colors } from "@/lib/constants/tokens"
import { useNavigation } from "expo-router"
import { useLayoutEffect, useState } from "react"
import { SearchBarProps } from "react-native-screens"

const defaultSearchOptions: SearchBarProps = {
  tintColor: colors.primary,
  hideWhenScrolling: false,
}

export function useNavSearch({
  searchbarOptions,
}: {
  searchbarOptions?: SearchBarProps
}) {
  const [search, setSearch] = useState("")

  const navigation = useNavigation()

  const handleOnChangeText: SearchBarProps["onChangeText"] = ({
    nativeEvent: { text },
  }) => {
    setSearch(text)
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ...defaultSearchOptions,
        ...searchbarOptions,
        onChangeText: handleOnChangeText,
      },
    })
  }, [navigation, searchbarOptions])

  return search
}
