import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { MOOPAY_LOGO } from "@/constants/images";
import { colors, typography } from "@/theme";

interface AppHeaderLogoProps {
  height?: number;
}

export function AppHeaderLogo({ height = 28 }: AppHeaderLogoProps) {
  const width = Math.round(height * (120 / 28));
  return (
    <Image
      source={MOOPAY_LOGO}
      style={{ height, width }}
      resizeMode="contain"
      accessibilityLabel="MooPay"
    />
  );
}

interface AppHeaderTitleProps {
  title: string;
}

export function AppHeaderTitle({ title }: AppHeaderTitleProps) {
  return <Text style={styles.title}>{title}</Text>;
}

interface AppHeaderBrandProps {
  subtitle?: string;
}

export function AppHeaderBrand({ subtitle }: AppHeaderBrandProps) {
  return (
    <View style={styles.brand}>
      <AppHeaderLogo height={32} />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h3,
    color: colors.navy,
  },
  brand: {
    alignItems: "center",
    gap: 4,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
