import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import ScreenContainer from "@/components/ScreenContainer";
import { importWallet } from "@/wallet/walletService";
import { colors, spacing, typography } from "@/theme";

export default function ImportWallet() {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const { mnemonic, address } = importWallet(phrase);
      router.push({
        pathname: "/onboarding/kyc",
        params: { mnemonic, address },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll keyboardAvoiding contentStyle={styles.content}>
      <Card>
        <Text style={styles.heading}>Enter recovery phrase</Text>
        <Text style={styles.body}>
          Paste your 12 or 24-word phrase separated by spaces. You will complete identity
          verification before the wallet is saved.
        </Text>
        <Input
          value={phrase}
          onChangeText={setPhrase}
          placeholder="word1 word2 word3 ..."
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          error={error ?? undefined}
        />
        <Button
          title="Continue to Verification"
          onPress={handleImport}
          loading={loading}
          disabled={phrase.trim().length < 10}
        />
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
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
