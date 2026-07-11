import Constants from "expo-constants";
import deployments from "./deployments.json";

export const CHAIN = {
  chainId: deployments.chainId,
  name: "Polygon Amoy",
  rpcUrl:
    process.env.EXPO_PUBLIC_AMOY_RPC_URL ??
    (Constants.expoConfig?.extra?.amoyRpcUrl as string) ??
    "https://rpc-amoy.polygon.technology/",
  explorerUrl: "https://amoy.polygonscan.com",
} as const;

export const PAYMENT_FORWARDER = deployments.paymentForwarder;

export type TokenConfig =
  | { symbol: string; decimals: number; native: true }
  | { symbol: string; decimals: number; native: false; address: string };

export const TOKENS: TokenConfig[] = [
  { symbol: "POL", decimals: 18, native: true },
  {
    symbol: "AE",
    decimals: 6,
    native: false,
    address: deployments.aeCoin,
  },
  {
    symbol: "MOO",
    decimals: 6,
    native: false,
    address: deployments.testToken,
  },
];
