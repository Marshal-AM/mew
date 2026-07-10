import { useEffect, useState } from "react";
import { Text, StyleSheet, View, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import AddressQr from "@/components/AddressQr";
import InlineNotice from "@/components/InlineNotice";
import ScreenContainer from "@/components/ScreenContainer";
import { useWallet } from "@/context/WalletProvider";
import { screeningStatusKey } from "@/lib/screeningStorage";
import { colors, spacing, radii, typography } from "@/theme";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

export default function ReceiveScreen() {
  const { address } = useWallet();
  const [copied, setCopied] = useState(false);
  const [screeningStatus, setScreeningStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setScreeningStatus(null);
      return;
    }
    void AsyncStorage.getItem(screeningStatusKey(address)).then(setScreeningStatus);
  }, [address]);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <InlineNotice message="Wallet not loaded" variant="error" />
      </ScreenContainer>
    );
  }

  const blocked = screeningStatus === "blocked";
  const pending = screeningStatus !== "cleared";

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      {blocked ? (
        <InlineNotice
          message="Funding is blocked — identity screening did not clear."
          variant="error"
        />
      ) : pending ? (
        <InlineNotice
          message="Complete identity verification before receiving funds."
          variant="warning"
        />
      ) : (
        <Text style={styles.subtitle}>Scan or copy your wallet address to receive tokens.</Text>
      )}

      {!blocked ? (
        <View style={styles.qrSection}>
          <AddressQr value={address} size={200} />
        </View>
      ) : null}

      {!blocked ? (
        <Pressable style={styles.addressRow} onPress={handleCopy}>
          <Text style={styles.address} selectable>
            {truncateAddress(address)}
          </Text>
          <HugeiconsIcon
            icon={Copy01Icon}
            size={18}
            color={copied ? colors.secondary : colors.textMuted}
            strokeWidth={1.8}
          />
        </Pressable>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: "100%",
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 300,
  },
  qrSection: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  address: {
    ...typography.bodyMedium,
    color: colors.navy,
    fontFamily: "monospace",
  },
});
