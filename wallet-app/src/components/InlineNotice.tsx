import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@/theme";

type NoticeVariant = "warning" | "error" | "info";

interface InlineNoticeProps {
  message: string;
  variant?: NoticeVariant;
}

function variantStyle(variant: NoticeVariant) {
  switch (variant) {
    case "error":
      return { bg: colors.errorSoft, border: colors.error, text: colors.error };
    case "warning":
      return { bg: colors.warningSoft, border: colors.warning, text: colors.text };
    default:
      return { bg: colors.infoSoft, border: colors.primary, text: colors.text };
  }
}

export default function InlineNotice({ message, variant = "info" }: InlineNoticeProps) {
  const palette = variantStyle(variant);
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    ...typography.body,
    textAlign: "center",
  },
});
