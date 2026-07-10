import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radii, spacing, typography } from "@/theme";

interface QuickActionButtonProps {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  style?: ViewStyle;
}

export default function QuickActionButton({
  label,
  icon,
  onPress,
  style,
}: QuickActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
