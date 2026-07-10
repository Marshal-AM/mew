import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radii } from "@/theme";

type BadgeVariant = "primary" | "success" | "warning" | "error" | "info" | "muted";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const variantStyles: Record<BadgeVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  error: { bg: colors.errorSoft, fg: colors.error },
  info: { bg: colors.infoSoft, fg: colors.info },
  muted: { bg: colors.surface, fg: colors.textMuted },
};

export default function Badge({ label, variant = "primary", style }: BadgeProps) {
  const v = variantStyles[variant];

  return (
    <View style={[styles.badge, { backgroundColor: v.bg }, style]}>
      <Text style={[styles.text, { color: v.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
