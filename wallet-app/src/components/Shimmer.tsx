import React from "react";
import { StyleSheet, View } from "react-native";
import ModernShimmer from "react-native-modern-shimmer";
import { colors, radii, spacing } from "@/theme";

interface ShimmerBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
}

export function ShimmerBox({ width, height, borderRadius = radii.md }: ShimmerBoxProps) {
  return (
    <View style={{ width: width as number, height, borderRadius, overflow: "hidden" }}>
      <ModernShimmer
        baseColor={colors.shimmerBase}
        isDark={false}
      />
    </View>
  );
}

export function ShimmerLine({ width = "100%" }: { width?: number | string }) {
  return <ShimmerBox width={width} height={16} borderRadius={radii.sm} />;
}

export function ShimmerCircle({ size = 48 }: { size?: number }) {
  return <ShimmerBox width={size} height={size} borderRadius={size / 2} />;
}

export function ShimmerCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <ShimmerCircle size={40} />
        <View style={styles.lines}>
          <ShimmerLine width="60%" />
          <ShimmerLine width="40%" />
        </View>
      </View>
      <ShimmerLine />
      <ShimmerLine width="75%" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  lines: {
    flex: 1,
    gap: spacing.sm,
  },
});
