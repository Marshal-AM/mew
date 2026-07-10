import { Tabs } from "expo-router";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Wallet02Icon,
  Clock01Icon,
  Settings02Icon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { AppHeaderLogo } from "@/components/AppHeader";
import { colors, spacing } from "@/theme";

const TAB_ICON_SIZE = 24;
const TAB_ICON_STROKE = 1.8;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;

  const defaultTabBarStyle = {
    backgroundColor: colors.tabBarBackground,
    borderTopColor: colors.tabBarBorder,
    paddingBottom: insets.bottom + spacing.xs,
    height: tabBarHeight,
  };

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <AppHeaderLogo />,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        tabBarStyle: defaultTabBarStyle,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? "index";
          const hideTabBar = routeName !== "index";
          return {
            title: "Wallet",
            headerShown: false,
            tabBarStyle: hideTabBar ? { display: "none" } : defaultTabBarStyle,
            tabBarIcon: ({ color }) => (
              <HugeiconsIcon
                icon={Wallet02Icon}
                size={TAB_ICON_SIZE}
                color={color}
                strokeWidth={TAB_ICON_STROKE}
              />
            ),
          };
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <HugeiconsIcon
              icon={Clock01Icon}
              size={TAB_ICON_SIZE}
              color={color}
              strokeWidth={TAB_ICON_STROKE}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <HugeiconsIcon
              icon={Settings02Icon}
              size={TAB_ICON_SIZE}
              color={color}
              strokeWidth={TAB_ICON_STROKE}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: "Logs",
          tabBarIcon: ({ color }) => (
            <HugeiconsIcon
              icon={File01Icon}
              size={TAB_ICON_SIZE}
              color={color}
              strokeWidth={TAB_ICON_STROKE}
            />
          ),
        }}
      />
    </Tabs>
  );
}
