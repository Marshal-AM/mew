import { Stack } from "expo-router";
import { AppHeaderLogo, AppHeaderTitle } from "@/components/AppHeader";
import { colors } from "@/theme";

export default function WalletStackLayout() {
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
          headerTitle: () => <AppHeaderLogo />,
        }}
      />
      <Stack.Screen
        name="send"
        options={{
          headerTitle: () => <AppHeaderTitle title="Send" />,
        }}
      />
      <Stack.Screen
        name="receive"
        options={{
          headerTitle: () => <AppHeaderTitle title="Receive" />,
        }}
      />
    </Stack>
  );
}
