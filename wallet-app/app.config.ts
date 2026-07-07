import { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Moo Wallet",
  slug: "moo-wallet",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "moo-wallet",
  platforms: ["ios", "android"],
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.moo.wallet",
    supportsTablet: false,
  },
  android: {
    package: "com.moo.wallet",
    adaptiveIcon: {
      backgroundColor: "#0a0a0f",
    },
  },
  plugins: ["expo-secure-store"],
  extra: {
    amoyRpcUrl:
      process.env.EXPO_PUBLIC_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology/",
  },
});
