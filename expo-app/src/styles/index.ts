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

const utilStyles = StyleSheet.create({
  ItemSeparator: {
    borderColor: colors.textMuted,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
})

export { defaultStyles, utilStyles }
