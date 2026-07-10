import { Text, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeaderLogo } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import ScreenContainer from "@/components/ScreenContainer";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing, typography } from "@/theme";

export default function OnboardingIndex() {
  const router = useRouter();
  const { startupError } = useWallet();

  return (
    <ScreenContainer padTop contentStyle={styles.container}>
      <View style={styles.content}>
        <AppHeaderLogo height={72} />
        <Text style={styles.subtitle}>
          Your recovery phrase stays encrypted on this device using secure storage.
        </Text>
        {startupError ? <Text style={styles.error}>{startupError}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Button title="Create New Wallet" onPress={() => router.push("/onboarding/create")} />
        <Button
          title="Import Existing Wallet"
          variant="outline"
          onPress={() => router.push("/onboarding/import")}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    marginBottom: spacing.xxl,
    gap: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 320,
  },
  error: {
    ...typography.body,
    color: colors.error,
    textAlign: "center",
  },
  actions: {
    gap: spacing.md,
  },
});
