import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import Card from "@/components/Card";
import ScreenContainer from "@/components/ScreenContainer";
import { createWallet } from "@/wallet/walletService";
import { colors, spacing, radii, typography } from "@/theme";

export default function CreateWallet() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    setLoading(true);
    setError(null);
    try {
      const { mnemonic, address } = createWallet();
      router.push({
        pathname: "/onboarding/backup",
        params: { mnemonic, address },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <Card>
        <Text style={styles.heading}>Generate a new wallet</Text>
        <Text style={styles.body}>
          A 12-word recovery phrase will be created on-device. You must back it up and
          complete identity verification before using the wallet.
        </Text>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
        <Button title="Generate Recovery Phrase" onPress={handleCreate} loading={loading} />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  heading: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
