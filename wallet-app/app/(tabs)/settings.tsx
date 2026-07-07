import { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { useWallet } from "@/context/WalletProvider";
import { SIGN_TEST_MESSAGE } from "@/wallet/walletService";
import { CHAIN, PAYMENT_FORWARDER } from "@/chain/config";
import { colors, spacing } from "@/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { address, signTestMessage, logout } = useWallet();
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<{
    signature: string;
    valid: boolean;
  } | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSignTest = async () => {
    setSigning(true);
    setSignError(null);
    setSignResult(null);
    try {
      const result = await signTestMessage();
      setSignResult(result);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setSigning(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/onboarding");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        <Text style={styles.row}>{CHAIN.name}</Text>
        <Text style={styles.rowMuted}>Chain ID: {CHAIN.chainId}</Text>
        <Text style={styles.rowMuted} numberOfLines={1}>
          RPC: {CHAIN.rpcUrl}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contracts (Phase 5)</Text>
        <Text style={styles.label}>Payment Forwarder</Text>
        <Text style={styles.mono} selectable>
          {PAYMENT_FORWARDER}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Signing test</Text>
        <Text style={styles.body}>
          Signs "{SIGN_TEST_MESSAGE}" with your wallet key and verifies the
          signature on-device — proves ethers + quick-crypto work on Amoy.
        </Text>
        <Button title="Run Sign Test" onPress={handleSignTest} loading={signing} />
        {signError ? <Text style={styles.error}>{signError}</Text> : null}
        {signResult ? (
          <View style={styles.resultBox}>
            <Text
              style={[
                styles.resultStatus,
                { color: signResult.valid ? colors.success : colors.error },
              ]}
            >
              {signResult.valid ? "Signature valid" : "Signature invalid"}
            </Text>
            <Text style={styles.label}>Recovered matches {address}</Text>
            <Text style={styles.mono} selectable>
              {signResult.signature}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Button
          title="Log Out"
          variant="danger"
          onPress={handleLogout}
          loading={loggingOut}
        />
        <Text style={styles.logoutHint}>
          Removes the recovery phrase from secure storage on this device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  row: {
    color: colors.text,
    fontSize: 15,
  },
  rowMuted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  mono: {
    color: colors.text,
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 16,
  },
  error: {
    color: colors.error,
    fontSize: 14,
  },
  resultBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  resultStatus: {
    fontSize: 16,
    fontWeight: "600",
  },
  logoutHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
});
