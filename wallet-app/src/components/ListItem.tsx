import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { colors, spacing, radii, typography } from "@/theme";

interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
  style?: ViewStyle;
}

export default function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  divider = true,
  style,
}: ListItemProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.container,
        divider && styles.divider,
        pressed && styles.pressed,
        style,
      ]}
    >
      {leading && <View style={styles.leading}>{leading}</View>}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing && <View style={styles.trailing}>{trailing}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    minHeight: 56,
  },
  pressed: {
    backgroundColor: colors.surface,
    transform: [{ scale: 0.99 }],
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    borderRadius: 0,
  },
  leading: {
    marginRight: spacing.md,
  },
  center: {
    flex: 1,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  trailing: {
    marginLeft: spacing.sm,
  },
});
