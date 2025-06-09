import { Link, Stack, usePathname } from "expo-router"
import { View, StyleSheet, Text } from "react-native"

export default function NotFoundScreen() {
  const pathname = usePathname()

  return (
    <>
      <Stack.Screen options={{ title: "Oops! This screen doesn't exist." }} />
      <View style={styles.container}>
        <Text style={styles.errorMessage}>
          The route "{pathname}" could not be found.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorMessage: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  link: {
    padding: 10,
  },
  linkText: {
    color: "#007AFF",
    fontSize: 16,
  },
})
