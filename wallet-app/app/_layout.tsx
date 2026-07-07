import "@/crypto/setup";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { WalletProvider } from "@/context/WalletProvider";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <WalletProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </WalletProvider>
  );
}
