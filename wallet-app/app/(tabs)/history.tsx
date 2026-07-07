import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/theme";

export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📋</Text>
      <Text style={styles.title}>No transactions yet</Text>
      <Text style={styles.body}>
        POS payments will appear here after settlement is recorded in Supabase
        (Phase 6). Offline BLE payments you make will show up once the relayer
        confirms them on-chain.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});
