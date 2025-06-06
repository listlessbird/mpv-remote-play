import { colors, fontSize } from "@/lib/constants/tokens"
import { StyleSheet } from "react-native"

const defaultStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  text: {
    fontSize: fontSize.base,
    color: colors.text,
  },
})

const utilStyles = StyleSheet.create({})

export { defaultStyles, utilStyles }
