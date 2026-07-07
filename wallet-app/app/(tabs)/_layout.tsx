import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "@/theme";

function TabIcon({ label }: { label: string }) {
  return <Text style={{ fontSize: 18 }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: () => <TabIcon label="💰" />,
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: "Receive",
          tabBarIcon: () => <TabIcon label="📥" />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: () => <TabIcon label="📋" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: () => <TabIcon label="⚙️" />,
        }}
      />
    </Tabs>
  );
}
