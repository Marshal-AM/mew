import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { importWallet } from "@/wallet/walletService";
import { saveMnemonic } from "@/wallet/secureStorage";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing } from "@/theme";

export default function ImportWallet() {
  const router = useRouter();
  const { unlockFromMnemonic } = useWallet();
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const { mnemonic } = importWallet(phrase);
      await saveMnemonic(mnemonic);
      unlockFromMnemonic(mnemonic);
      router.replace("/(tabs)/wallet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Enter recovery phrase</Text>
        <Text style={styles.body}>
          Paste your 12 or 24-word phrase separated by spaces.
        </Text>
        <TextInput
          style={styles.input}
          value={phrase}
          onChangeText={setPhrase}
          placeholder="word1 word2 word3 ..."
          placeholderTextColor={colors.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="top"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title="Import Wallet"
          onPress={handleImport}
          loading={loading}
          disabled={phrase.trim().length < 10}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.text,
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    minHeight: 120,
    fontFamily: "monospace",
  },
  error: {
    color: colors.error,
    fontSize: 14,
  },
});
