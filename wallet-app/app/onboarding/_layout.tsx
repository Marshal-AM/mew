import { Stack } from "expo-router";
import { AppHeaderTitle } from "@/components/AppHeader";
import { colors } from "@/theme";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.navy,
        headerTitleStyle: { fontWeight: "600" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: "",
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          headerTitle: () => <AppHeaderTitle title="Create Wallet" />,
        }}
      />
      <Stack.Screen
        name="backup"
        options={{
          headerTitle: () => <AppHeaderTitle title="Backup Phrase" />,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          headerTitle: () => <AppHeaderTitle title="Import Wallet" />,
        }}
      />
      <Stack.Screen
        name="kyc"
        options={{
          headerTitle: () => <AppHeaderTitle title="Identity Verification" />,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
