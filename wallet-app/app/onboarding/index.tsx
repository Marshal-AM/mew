import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { colors, spacing } from "@/theme";

export default function OnboardingIndex() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Moo Wallet</Text>
      <Text style={styles.subtitle}>
        Offline-ready Polygon wallet. Your keys stay on this device in secure
        storage.
      </Text>
      <View style={styles.actions}>
        <Button title="Create New Wallet" onPress={() => router.push("/onboarding/create")} />
        <Button
          title="Import Existing Wallet"
          variant="secondary"
          onPress={() => router.push("/onboarding/import")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  actions: {
    gap: spacing.md,
  },
});
