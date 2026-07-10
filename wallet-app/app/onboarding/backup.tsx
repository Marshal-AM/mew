import { useState } from "react";
import { Text, StyleSheet, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/Button";
import Card from "@/components/Card";
import ScreenContainer from "@/components/ScreenContainer";
import { colors, spacing, radii, typography } from "@/theme";

export default function BackupPhrase() {
  const { mnemonic, address } = useLocalSearchParams<{
    mnemonic: string;
    address: string;
  }>();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!mnemonic || !address) {
    return (
      <ScreenContainer contentStyle={styles.screen}>
        <Text style={styles.errorText}>Missing wallet data. Go back and try again.</Text>
      </ScreenContainer>
    );
  }

  const words = mnemonic.split(" ");

  const handleCopy = async () => {
    await Clipboard.setStringAsync(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    if (!confirmed) return;
    router.push({
      pathname: "/onboarding/kyc",
      params: { mnemonic, address },
    });
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Card style={styles.warningCard}>
        <Text style={styles.warningText}>
          Write these 12 words down in order. Never share them. Anyone with this phrase
          controls your wallet.
        </Text>
      </Card>

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

      <Pressable style={styles.checkboxRow} onPress={() => setConfirmed((v) => !v)}>
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
          {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.checkboxLabel}>
          I have written down my recovery phrase and stored it safely
        </Text>
      </Pressable>

      <Button
        title="Continue to Verification"
        onPress={handleContinue}
        disabled={!confirmed}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md },
  container: { gap: spacing.md, paddingTop: spacing.md },
  warningCard: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  warningText: {
    ...typography.body,
    color: colors.warning,
  },
  address: {
    ...typography.caption,
    color: colors.textMuted,
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
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  wordIndex: {
    ...typography.caption,
    color: colors.textMuted,
    width: 20,
  },
  word: {
    ...typography.bodyMedium,
    color: colors.text,
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
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  checkboxLabel: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
});
