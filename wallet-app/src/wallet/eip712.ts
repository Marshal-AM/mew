import { parseUnits } from "ethers";
import * as Crypto from "expo-crypto";
import { CHAIN, PAYMENT_FORWARDER } from "../chain/config";
import deployments from "../chain/deployments.json";
import type { PaymentRequest } from "../protocol/paymentRequest";

export const FORWARDER_NAME = "Moo Payment Forwarder";
export const FORWARDER_VERSION = "1";

export const TRANSFER_TYPES: Record<string, { name: string; type: string }[]> = {
  TransferWithAuthorization: [
    { name: "token", type: "address" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export const PAYMENT_TOKEN_ADDRESS = deployments.aeCoin;
export const PAYMENT_TOKEN_DECIMALS = 6;

export type TransferMessage = {
  token: string;
  from: string;
  to: string;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: string;
};

export function getForwarderDomain() {
  return {
    name: FORWARDER_NAME,
    version: FORWARDER_VERSION,
    chainId: CHAIN.chainId,
    verifyingContract: PAYMENT_FORWARDER,
  };
}

export async function randomBytes32(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

export async function buildTransferMessage(
  from: string,
  to: string,
  request: PaymentRequest,
  nonce?: string
): Promise<TransferMessage> {
  const now = Math.floor(Date.now() / 1000);
  if (request.exp <= now) {
    throw new Error("Payment request has expired");
  }

  const value = parseUnits(request.amt, PAYMENT_TOKEN_DECIMALS);
  const authNonce = nonce ?? (await randomBytes32());

  return {
    token: PAYMENT_TOKEN_ADDRESS,
    from,
    to,
    value,
    validAfter: 0n,
    validBefore: BigInt(request.exp),
    nonce: authNonce,
  };
}
