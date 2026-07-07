import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { createWallet } from "@/wallet/walletService";
import { colors, spacing } from "@/theme";

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
    <View style={styles.container}>
      <Text style={styles.heading}>Generate a new wallet</Text>
      <Text style={styles.body}>
        A 12-word recovery phrase will be created. You must back it up before
        using the wallet — it is the only way to recover your funds.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Generate Recovery Phrase" onPress={handleCreate} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
});
