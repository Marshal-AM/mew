import {
  Contract,
  JsonRpcProvider,
  Wallet,
  getAddress,
} from "https://esm.sh/ethers@6.13.0";
import type { ChainConfig, SignedPaymentPayload } from "./types.ts";

const FORWARDER_ABI = [
  "function authorizationState(address token, address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address token, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
];

const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];

export function loadChainConfig(): ChainConfig {
  const rpcUrl = Deno.env.get("AMOY_RPC_URL") ?? Deno.env.get("EXPO_PUBLIC_AMOY_RPC_URL");
  const relayerPrivateKey =
    Deno.env.get("RELAYER_PRIVATE_KEY") ?? Deno.env.get("PRIVATE_KEY");
  const forwarderAddress =
    Deno.env.get("PAYMENT_FORWARDER_ADDRESS") ?? "0x9F0BF4aE6BBfD51eDbff77eA0D17A7bec484bb97";
  const chainId = parseInt(Deno.env.get("CHAIN_ID") ?? "80002", 10);

  if (!rpcUrl) throw new Error("Missing AMOY_RPC_URL");
  if (!relayerPrivateKey) throw new Error("Missing RELAYER_PRIVATE_KEY or PRIVATE_KEY");

  return {
    rpcUrl,
    relayerPrivateKey,
    forwarderAddress: getAddress(forwarderAddress),
    chainId,
  };
}

export function createChainClients(config: ChainConfig) {
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const relayer = new Wallet(config.relayerPrivateKey, provider);
  const forwarder = new Contract(config.forwarderAddress, FORWARDER_ABI, relayer);
  return { provider, relayer, forwarder };
}

export async function isAuthorizationUsed(
  forwarder: Contract,
  token: string,
  from: string,
  nonce: string
): Promise<boolean> {
  return await forwarder.authorizationState(token, from, nonce);
}

export async function getTokenBalance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  wallet: string
): Promise<bigint> {
  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  return BigInt(await token.balanceOf(wallet));
}

export async function relayTransferWithAuthorization(
  forwarder: Contract,
  payload: SignedPaymentPayload
): Promise<string> {
  const tx = await forwarder.transferWithAuthorization(
    payload.tokenAddress,
    payload.from,
    payload.to,
    BigInt(payload.value),
    BigInt(payload.validAfter),
    BigInt(payload.validBefore),
    payload.nonce,
    payload.signature
  );
  const receipt = await tx.wait(1);
  if (!receipt?.hash) {
    throw new Error("Relay transaction failed to receipt without hash");
  }
  return receipt.hash;
}
