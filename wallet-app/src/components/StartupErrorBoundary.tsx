import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { colors, spacing, typography } from "@/theme";
import { AppHeaderBrand } from "./AppHeader";
import ScreenContainer from "./ScreenContainer";

type FatalBoundaryState = {
  error: string | null;
  stack: string | null;
};

export default class StartupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  FatalBoundaryState
> {
  state: FatalBoundaryState = {
    error: null,
    stack: null,
  };

  static getDerivedStateFromError(error: Error): FatalBoundaryState {
    return {
      error: error.message,
      stack: error.stack ?? null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[MooErrorBoundary]",
      error.message,
      error.stack ?? "no stack",
      info.componentStack
    );
  }

  render() {
    if (this.state.error) {
      return (
        <ScreenContainer scroll>
          <AppHeaderBrand subtitle="Startup error" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error}</Text>
          {this.state.stack ? (
            <ScrollView horizontal>
              <Text style={styles.errorStack}>{this.state.stack}</Text>
            </ScrollView>
          ) : null}
        </ScreenContainer>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorTitle: {
    ...typography.h2,
    color: colors.error,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  errorStack: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: "monospace",
    lineHeight: 18,
  },
});
