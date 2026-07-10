import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing, textInput, typography } from "@/theme";

interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

function inputVerticalPadding(): number {
  return Platform.select(textInput.paddingVertical) ?? textInput.paddingVertical.default;
}

export function getTextInputStyle(
  multiline: boolean,
  borderColor: string = colors.border
): TextStyle {
  const base: TextStyle = {
    fontSize: textInput.fontSize,
    color: colors.text,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor,
    paddingHorizontal: textInput.paddingHorizontal,
    paddingTop: inputVerticalPadding(),
    paddingBottom: inputVerticalPadding(),
  };

  if (Platform.OS === "android") {
    base.includeFontPadding = false;
  }

  if (multiline) {
    return {
      ...base,
      minHeight: textInput.multilineMinHeight,
      lineHeight: textInput.multilineLineHeight,
      textAlignVertical: "top",
    };
  }

  return {
    ...base,
    minHeight: textInput.singleMinHeight,
    ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
  };
}

export default function Input({
  label,
  error,
  containerStyle,
  multiline,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : focused
      ? colors.primary
      : colors.border;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={getTextInputStyle(Boolean(multiline), borderColor)}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
});
