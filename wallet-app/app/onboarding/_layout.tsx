import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Moo Wallet" }} />
      <Stack.Screen name="create" options={{ title: "Create Wallet" }} />
      <Stack.Screen name="backup" options={{ title: "Backup Phrase", gestureEnabled: false }} />
      <Stack.Screen name="import" options={{ title: "Import Wallet" }} />
    </Stack>
  );
}
