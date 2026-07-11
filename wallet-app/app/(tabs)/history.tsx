import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  Text,
  StyleSheet,
  View,
} from "react-native";
import { formatUnits } from "ethers";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import InlineNotice from "@/components/InlineNotice";
import ScreenContainer from "@/components/ScreenContainer";
import { useWallet } from "@/context/WalletProvider";
import { loadPaymentHistory, statusLabel } from "@/cache/transactionSync";
import { type PendingPayment } from "@/cache/pendingPayments";
import { colors, spacing, typography } from "@/theme";

export default function HistoryScreen() {
  const { syncTransactions, transactionSyncError } = useWallet();
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncTransactions();
      setItems(await loadPaymentHistory());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [syncTransactions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScreenContainer
      scroll
      padBottom={false}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.title}>Payment history</Text>
      <Text style={styles.body}>
        Payments sync from the merchant backend when online. Pending items update once
        the pipeline settles on-chain.
      </Text>

      {transactionSyncError ? (
        <InlineNotice message={transactionSyncError} variant="error" />
      ) : null}

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Offline BLE payments you make will show up once the relayer confirms them on-chain."
        />
      ) : null}

      {items.map((item) => (
        <Card key={item.id}>
          <Text
            style={[
              styles.status,
              {
                color:
                  item.status === "confirmed"
                    ? colors.success
                    : item.status === "pending"
                      ? colors.warning
                      : colors.error,
              },
            ]}
          >
            {statusLabel(item.status)}
          </Text>
          <Text style={styles.mono}>{formatUnits(item.value, 6)} AE</Text>
          <Text style={styles.mono}>posId: {item.posId}</Text>
          <Text style={styles.mono}>reqId: {item.reqId}</Text>
          <Text style={styles.mono}>to: {item.to}</Text>
          {item.txHash ? <Text style={styles.mono}>tx: {item.txHash}</Text> : null}
          <Text style={styles.mono}>
            created: {new Date(item.createdAt).toLocaleString()}
          </Text>
        </Card>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  status: {
    ...typography.captionMedium,
    marginBottom: spacing.xs,
  },
  mono: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: "monospace",
    lineHeight: 18,
  },
});
