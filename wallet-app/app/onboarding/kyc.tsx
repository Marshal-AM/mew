import { useState } from "react";
import { Alert, Text, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import ScreenContainer from "@/components/ScreenContainer";
import { useWallet } from "@/context/WalletProvider";
import {
  getCustomerScreeningRecord,
  registerCustomerKyc,
  isScreeningConfigured,
} from "@/lib/screening";
import { screeningNameKey, screeningStatusKey } from "@/lib/screeningStorage";
import { saveMnemonic } from "@/wallet/secureStorage";
import { colors, spacing, radii, typography } from "@/theme";

export default function KycScreen() {
  const { mnemonic, address } = useLocalSearchParams<{
    mnemonic: string;
    address: string;
  }>();
  const router = useRouter();
  const { unlockFromMnemonic } = useWallet();
  const [fullName, setFullName] = useState("");
  const [idDocRef, setIdDocRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!mnemonic || !address) {
    return (
      <ScreenContainer contentStyle={styles.content}>
        <Text style={styles.error}>Missing wallet data. Go back and try again.</Text>
      </ScreenContainer>
    );
  }

  const finishOnboarding = async () => {
    await saveMnemonic(mnemonic);
    unlockFromMnemonic(mnemonic);
    router.replace("/(tabs)/wallet");
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isScreeningConfigured()) {
        const result = await registerCustomerKyc(
          address,
          fullName.trim(),
          idDocRef.trim() || undefined
        );
        await AsyncStorage.multiSet([
          [screeningStatusKey(address), result.screening_status],
          [screeningNameKey(address), fullName.trim()],
        ]);
        if (result.screening_status === "blocked") {
          throw new Error("Identity screening blocked wallet registration");
        }
        const record = await getCustomerScreeningRecord(address);
        if (!record?.full_name || record.screening_status !== "cleared") {
          throw new Error(
            "Screening did not persist for this wallet. Please try again before continuing."
          );
        }
        Alert.alert(
          "Wallet screening successful",
          `Wallet ${address} is cleared and can proceed.`,
          [{ text: "OK", onPress: () => void finishOnboarding() }]
        );
        return;
      }

      await finishOnboarding();
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC screening failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll keyboardAvoiding contentStyle={styles.content}>
      <Card>
        <Text style={styles.lead}>
          Verify your identity before funding. Names are checked against UN Security Council
          and UAE sanctions lists.
        </Text>

        <View style={styles.walletBlock}>
          <Text style={styles.walletLabel}>Wallet address</Text>
          <Text style={styles.walletAddress} selectable>
            {address}
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Full legal name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Jane Doe"
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Input
            label="ID reference (optional)"
            value={idDocRef}
            onChangeText={setIdDocRef}
            placeholder="Passport or Emirates ID"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Button
          title={loading ? "Screening…" : "Submit & Continue"}
          onPress={handleSubmit}
          loading={loading}
          disabled={loading || fullName.trim().length < 2}
        />

        {!isScreeningConfigured() ? (
          <Text style={styles.footnote}>
            Screening is not configured in this build. Your wallet will unlock without a remote
            check.
          </Text>
        ) : null}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  walletBlock: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    gap: spacing.xs,
  },
  walletLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  walletAddress: {
    fontSize: 14,
    fontFamily: "monospace",
    color: colors.navy,
    lineHeight: 22,
  },
  form: {
    gap: spacing.md,
  },
  errorBox: {
    backgroundColor: colors.errorSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  error: {
    ...typography.body,
    color: colors.error,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
});
