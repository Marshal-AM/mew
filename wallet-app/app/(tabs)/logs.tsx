import { useEffect, useState } from "react";
import { Text, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/Button";
import Card from "@/components/Card";
import ScreenContainer from "@/components/ScreenContainer";
import { clearLogs, getLogs, subscribeLogs, type LogEntry } from "@/logging/appLogs";
import { colors, spacing, typography } from "@/theme";

export default function LogsScreen() {
  const [items, setItems] = useState<LogEntry[]>(() => getLogs());

  useEffect(() => subscribeLogs(() => setItems(getLogs())), []);

  const text = items
    .map((item) => `[${item.timestamp}] ${item.level.toUpperCase()} ${item.message}`)
    .join("\n");

  return (
    <ScreenContainer scroll padBottom={false} contentStyle={styles.content}>
      <Text style={styles.title}>Debug logs</Text>
      <Text style={styles.body}>
        App, BLE, wallet, pay-flow, and error logs. Look for tags like [Pay], [BLE],
        [Transfer], [Allowance], [Registry], and [Sign] while testing payments.
      </Text>

      <View style={styles.row}>
        <Button
          title="Copy Logs"
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(text || "No logs yet.");
          }}
        />
        <Button title="Clear Logs" variant="outline" onPress={() => clearLogs()} />
      </View>

      {items.length === 0 ? (
        <Card>
          <Text style={styles.body}>No logs yet.</Text>
        </Card>
      ) : (
        items
          .slice()
          .reverse()
          .map((item) => (
            <Card key={item.id}>
              <Text style={styles.meta}>
                [{new Date(item.timestamp).toLocaleTimeString()}]{" "}
                {item.level.toUpperCase()}
              </Text>
              <Text style={styles.message}>{item.message}</Text>
            </Card>
          ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: "monospace",
    marginBottom: spacing.xs,
  },
  message: {
    ...typography.body,
    color: colors.text,
  },
});
