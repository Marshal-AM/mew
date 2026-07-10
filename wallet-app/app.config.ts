import { ConfigContext, ExpoConfig } from "expo/config";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const amoyRpcUrl =
  process.env.EXPO_PUBLIC_AMOY_RPC_URL ??
  process.env.AMOY_RPC_URL ??
  "https://rpc-amoy.polygon.technology/";
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MooPay",
  slug: "moopay",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "moopay",
  platforms: ["ios", "android"],
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.moo.wallet",
    supportsTablet: false,
    infoPlist: {
      CFBundleDisplayName: "MooPay",
      NSBluetoothAlwaysUsageDescription:
        "MooPay uses Bluetooth to connect to POS terminals for offline payments.",
      NSCameraUsageDescription: "MooPay scans POS payment QR codes.",
      NSFaceIDUsageDescription:
        "MooPay uses Face ID to authorize offline payments before signing.",
    },
  },
  android: {
    package: "com.moo.wallet",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
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
    "expo-router",
    "expo-secure-store",
    "expo-local-authentication",
    ["react-native-ble-plx", { isBackgroundEnabled: false, modes: ["central"] }],
    ["expo-camera", { cameraPermission: "Scan POS payment QR codes" }],
    "./plugins/withIosXcodeFixes",
  ],
  extra: {
    amoyRpcUrl,
    supabaseUrl,
    supabaseAnonKey,
  },
});
