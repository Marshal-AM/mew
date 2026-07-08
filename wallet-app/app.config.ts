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
    infoPlist: {
      NSBluetoothAlwaysUsageDescription:
        "Moo Wallet uses Bluetooth to connect to POS terminals for offline payments.",
      NSCameraUsageDescription: "Moo Wallet scans POS payment QR codes.",
      NSFaceIDUsageDescription:
        "Moo Wallet uses Face ID to authorize offline payments before signing.",
    },
  },
  android: {
    package: "com.moo.wallet",
    adaptiveIcon: {
      backgroundColor: "#0a0a0f",
    },
    permissions: [
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      "ACCESS_FINE_LOCATION",
      "CAMERA",
      "USE_BIOMETRIC",
      "USE_FINGERPRINT",
    ],
  },
  plugins: [
    "expo-secure-store",
    "expo-local-authentication",
    ["react-native-ble-plx", { isBackgroundEnabled: false, modes: ["central"] }],
    ["expo-camera", { cameraPermission: "Scan POS payment QR codes" }],
  ],
  extra: {
    amoyRpcUrl:
      process.env.EXPO_PUBLIC_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology/",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
});
