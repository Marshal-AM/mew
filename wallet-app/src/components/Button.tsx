import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { colors, spacing, radii, typography } from "@/theme";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const HEIGHT: Record<Size, number> = { sm: 40, md: 48, lg: 56 };

const FONT: Record<Size, TextStyle> = {
  sm: { fontSize: 13, fontWeight: "600" },
  md: { fontSize: 15, fontWeight: "600" },
  lg: { fontSize: 17, fontWeight: "600" },
};

const containerVariant: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.error },
  ghost: { backgroundColor: "transparent" },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
};

const textVariant: Record<Variant, TextStyle> = {
  primary: { color: colors.textOnPrimary },
  secondary: { color: colors.navy },
  danger: { color: colors.textOnPrimary },
  ghost: { color: colors.primary },
  outline: { color: colors.text },
};

const pressedBg: Record<Variant, string> = {
  primary: colors.primaryHover,
  secondary: colors.surface,
  danger: "#dc2626",
  ghost: colors.primarySoft,
  outline: colors.surface,
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        containerVariant[variant],
        { minHeight: HEIGHT[size] },
        pressed && { backgroundColor: pressedBg[variant], transform: [{ scale: 0.97 }] },
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textVariant[variant].color} />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[styles.text, textVariant[variant], FONT[size]]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    alignSelf: "stretch",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    marginRight: spacing.xxs,
  },
  text: {
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});

export { Button };
