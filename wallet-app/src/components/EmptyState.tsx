import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, spacing, typography } from "@/theme";
import Button from "./Button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionTitle && onAction && (
        <Button
          title={actionTitle}
          onPress={onAction}
          size="sm"
          style={styles.button}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  button: {
    marginTop: spacing.lg,
  },
});
