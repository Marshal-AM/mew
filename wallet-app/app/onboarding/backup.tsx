import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/Button";
import { saveMnemonic } from "@/wallet/secureStorage";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing } from "@/theme";

export default function BackupPhrase() {
  const { mnemonic, address } = useLocalSearchParams<{
    mnemonic: string;
    address: string;
  }>();
  const router = useRouter();
  const { unlockFromMnemonic } = useWallet();
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mnemonic || !address) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Missing wallet data. Go back and try again.</Text>
      </View>
    );
  }

  const words = mnemonic.split(" ");

  const handleCopy = async () => {
    await Clipboard.setStringAsync(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = async () => {
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await saveMnemonic(mnemonic);
      unlockFromMnemonic(mnemonic);
      router.replace("/(tabs)/wallet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save wallet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.warning}>
        Write these 12 words down in order. Never share them. Anyone with this
        phrase controls your wallet.
      </Text>
      <Text style={styles.address}>Address: {address}</Text>
      <View style={styles.grid}>
        {words.map((word, i) => (
          <View key={i} style={styles.wordCell}>
            <Text style={styles.wordIndex}>{i + 1}</Text>
            <Text style={styles.word}>{word}</Text>
          </View>
        ))}
      </View>
      <Button
        title={copied ? "Copied!" : "Copy Phrase"}
        variant="secondary"
        onPress={handleCopy}
      />
      <Pressable
        style={styles.checkboxRow}
        onPress={() => setConfirmed((v) => !v)}
      >
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
          {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.checkboxLabel}>
          I have written down my recovery phrase and stored it safely
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title="Continue to Wallet"
        onPress={handleContinue}
        disabled={!confirmed}
        loading={saving}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  warning: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  address: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: "monospace",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  wordCell: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: 8,
    gap: spacing.sm,
  },
  wordIndex: {
    color: colors.textMuted,
    fontSize: 12,
    width: 20,
  },
  word: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  checkboxLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.error,
    fontSize: 14,
  },
});
