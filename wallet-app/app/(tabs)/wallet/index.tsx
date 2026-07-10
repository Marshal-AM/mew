import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  ArrowDown01Icon,
  Clock01Icon,
  Settings02Icon,
  Copy01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import ScreenContainer from "@/components/ScreenContainer";
import QuickActionButton from "@/components/QuickActionButton";
import InlineNotice from "@/components/InlineNotice";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing, radii, typography, shadows } from "@/theme";
import type { TokenBalance } from "@/chain/balances";
import {
  formatAed,
  tokenValueAed,
  totalPortfolioAed,
} from "@/lib/portfolioValue";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function tokenAccent(symbol: string): string {
  if (symbol === "POL") return colors.secondary;
  if (symbol === "MOO") return colors.primary;
  return colors.textMuted;
}

function TokenRow({ item }: { item: TokenBalance }) {
  const aed = tokenValueAed(item);
  const displayAmount = item.error
    ? "—"
    : `${parseFloat(item.balance).toFixed(item.symbol === "POL" ? 4 : 2)} ${item.symbol}`;

  return (
    <View style={styles.tokenRow}>
      <View style={[styles.tokenIcon, { backgroundColor: `${tokenAccent(item.symbol)}22` }]}>
        <Text style={[styles.tokenIconText, { color: tokenAccent(item.symbol) }]}>
          {item.symbol.slice(0, 1)}
        </Text>
      </View>
      <View style={styles.tokenMeta}>
        <Text style={styles.tokenSymbol} numberOfLines={1}>
          {item.symbol}
        </Text>
      </View>
      <View style={styles.tokenValues}>
        <Text style={styles.tokenAed} numberOfLines={1}>
          {aed != null ? formatAed(aed) : item.error ? "Unavailable" : "—"}
        </Text>
        <Text style={styles.tokenAmount} numberOfLines={1}>
          {displayAmount}
        </Text>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const {
    address,
    balances,
    balancesLoading,
    balancesError,
    refreshBalances,
  } = useWallet();
  const [copied, setCopied] = useState(false);

  const totalAed = useMemo(() => totalPortfolioAed(balances), [balances]);

  const onRefresh = useCallback(async () => {
    await refreshBalances();
  }, [refreshBalances]);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ScreenContainer
      scroll
      padBottom={false}
      refreshControl={
        <RefreshControl
          refreshing={balancesLoading}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      contentStyle={styles.content}
    >
      <View style={styles.accountRow}>
        <Pressable style={styles.accountPill} onPress={handleCopy}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {address ? address.slice(2, 4).toUpperCase() : "?"}
            </Text>
          </View>
          <Text style={styles.accountAddress} numberOfLines={1}>
            {address ? truncateAddress(address) : "—"}
          </Text>
          <HugeiconsIcon
            icon={Copy01Icon}
            size={16}
            color={copied ? colors.secondary : colors.textMuted}
            strokeWidth={1.8}
          />
        </Pressable>
      </View>

      {balancesError ? (
        <InlineNotice message={balancesError} variant="error" />
      ) : null}

      <View style={styles.balanceHero}>
        <Text style={styles.balanceLabel}>Total balance</Text>
        {balancesLoading && balances.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={styles.balanceLoader} />
        ) : (
          <Text
            style={styles.balanceAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatAed(totalAed)}
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <QuickActionButton
          label="Send"
          icon={
            <HugeiconsIcon
              icon={SentIcon}
              size={24}
              color={colors.primary}
              strokeWidth={1.8}
            />
          }
          onPress={() => router.push("/(tabs)/wallet/send")}
        />
        <QuickActionButton
          label="Receive"
          icon={
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={24}
              color={colors.primary}
              strokeWidth={1.8}
            />
          }
          onPress={() => router.push("/(tabs)/wallet/receive")}
        />
        <QuickActionButton
          label="History"
          icon={
            <HugeiconsIcon
              icon={Clock01Icon}
              size={24}
              color={colors.primary}
              strokeWidth={1.8}
            />
          }
          onPress={() => router.push("/(tabs)/history")}
        />
        <QuickActionButton
          label="Settings"
          icon={
            <HugeiconsIcon
              icon={Settings02Icon}
              size={24}
              color={colors.primary}
              strokeWidth={1.8}
            />
          }
          onPress={() => router.push("/(tabs)/settings")}
        />
      </View>

      <View style={styles.tokensHeader}>
        <Text style={styles.tokensTitle}>Tokens</Text>
      </View>

      <View style={styles.tokenList}>
        {balances.map((item) => (
          <TokenRow key={item.symbol} item={item} />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: "100%",
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  accountRow: {
    width: "100%",
    alignItems: "center",
  },
  accountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: "100%",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  accountAddress: {
    ...typography.bodyMedium,
    color: colors.navy,
    fontFamily: "monospace",
    flexShrink: 1,
  },
  balanceHero: {
    width: "100%",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  balanceLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  balanceAmount: {
    width: "100%",
    fontSize: 36,
    fontWeight: "700",
    color: colors.navy,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  balanceLoader: {
    marginTop: spacing.md,
  },
  actionsRow: {
    width: "100%",
    flexDirection: "row",
    gap: spacing.xs,
  },
  tokensHeader: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
  },
  tokensTitle: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  tokenList: {
    width: "100%",
    gap: spacing.sm,
  },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tokenIconText: {
    ...typography.bodyMedium,
    fontWeight: "700",
  },
  tokenMeta: {
    flex: 1,
    minWidth: 0,
  },
  tokenValues: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 2,
  },
  tokenSymbol: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  tokenAmount: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  tokenAed: {
    ...typography.bodyMedium,
    color: colors.text,
  },
});
