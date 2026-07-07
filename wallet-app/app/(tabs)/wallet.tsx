import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Network from "expo-network";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing } from "@/theme";
import { CHAIN } from "@/chain/config";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletScreen() {
  const {
    address,
    balances,
    balancesLoading,
    balancesError,
    refreshBalances,
  } = useWallet();
  const [copied, setCopied] = useState(false);
  const [offline, setOffline] = useState(false);

  const onRefresh = useCallback(async () => {
    const state = await Network.getNetworkStateAsync();
    setOffline(!state.isConnected);
    await refreshBalances();
  }, [refreshBalances]);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={balancesLoading}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.network}>{CHAIN.name}</Text>
      {offline ? (
        <Text style={styles.offline}>No connection — balances may be stale</Text>
      ) : null}
      {balancesError ? (
        <Text style={styles.error}>{balancesError}</Text>
      ) : null}

      <Pressable onPress={handleCopy} style={styles.addressCard}>
        <Text style={styles.addressLabel}>Your address</Text>
        <Text style={styles.address}>{address ? truncateAddress(address) : "—"}</Text>
        <Text style={styles.copyHint}>{copied ? "Copied!" : "Tap to copy"}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Balances</Text>
      {balances.map((item) => (
        <View key={item.symbol} style={styles.balanceRow}>
          <Text style={styles.tokenSymbol}>{item.symbol}</Text>
          <View style={styles.balanceRight}>
            {item.error ? (
              <Text style={styles.balanceError}>Unavailable</Text>
            ) : (
              <Text style={styles.balanceAmount}>
                {parseFloat(item.balance).toFixed(
                  item.symbol === "POL" ? 4 : 2
                )}
              </Text>
            )}
          </View>
        </View>
      ))}

      {balancesLoading && balances.length === 0 ? (
        <Text style={styles.loading}>Loading balances from Amoy…</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  network: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  offline: {
    color: colors.warning,
    fontSize: 13,
  },
  error: {
    color: colors.error,
    fontSize: 14,
  },
  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  address: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  copyHint: {
    color: colors.accent,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tokenSymbol: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  balanceRight: {
    alignItems: "flex-end",
  },
  balanceAmount: {
    color: colors.text,
    fontSize: 18,
    fontFamily: "monospace",
  },
  balanceError: {
    color: colors.error,
    fontSize: 13,
  },
  loading: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
