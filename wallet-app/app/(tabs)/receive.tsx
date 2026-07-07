import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing } from "@/theme";

export default function ReceiveScreen() {
  const { address } = useWallet();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Wallet not loaded</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Receive on Polygon Amoy</Text>
      <Text style={styles.subtitle}>
        Share this address or QR code to receive POL or ERC-20 tokens.
      </Text>
      <View style={styles.qrWrapper}>
        <QRCode value={address} size={220} backgroundColor={colors.text} color={colors.background} />
      </View>
      <Text style={styles.address} selectable>
        {address}
      </Text>
      <Pressable onPress={handleCopy} style={styles.copyButton}>
        <Text style={styles.copyText}>{copied ? "Copied!" : "Copy Address"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: colors.text,
    borderRadius: 16,
    marginBottom: spacing.lg,
  },
  address: {
    color: colors.text,
    fontSize: 13,
    fontFamily: "monospace",
    textAlign: "center",
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: colors.error,
  },
});
