import "@/crypto/setup";
import "@/logging/install";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import StartupErrorBoundary from "@/components/StartupErrorBoundary";
import { WalletProvider } from "@/context/WalletProvider";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StartupErrorBoundary>
        <WalletProvider>
          <StatusBar style={colors.statusBarStyle} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </WalletProvider>
      </StartupErrorBoundary>
    </SafeAreaProvider>
  );
}
