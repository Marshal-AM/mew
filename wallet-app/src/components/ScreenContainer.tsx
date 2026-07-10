import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  /** Set false when a navigator already provides top inset */
  padTop?: boolean;
  /** Set false when tab bar or home indicator is handled elsewhere */
  padBottom?: boolean;
  keyboardAvoiding?: boolean;
  refreshControl?: React.ReactElement;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

export default function ScreenContainer({
  children,
  scroll = false,
  padTop = false,
  padBottom = true,
  keyboardAvoiding = false,
  refreshControl,
  style,
  contentStyle,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  const baseBottomPad = padBottom ? Math.max(insets.bottom, spacing.md) : 0;
  const contentPadBottom =
    typeof contentStyle?.paddingBottom === "number" ? contentStyle.paddingBottom : 0;
  const { paddingBottom: _ignored, ...restContentStyle } = contentStyle ?? {};

  const containerStyle: ViewStyle = {
    flexGrow: scroll ? undefined : 1,
    width: "100%",
    maxWidth: "100%",
    backgroundColor: colors.background,
    paddingTop: padTop ? insets.top : 0,
    paddingBottom: baseBottomPad + contentPadBottom,
    paddingHorizontal: spacing.lg,
  };

  const body = scroll ? (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }, style]}
      contentContainerStyle={[containerStyle, restContentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[containerStyle, style, restContentStyle]}>{children}</View>
  );

  if (!keyboardAvoiding) {
    return body;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
