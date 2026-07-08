import { getAddress } from "https://esm.sh/ethers@6.13.0";
import type { SignedPaymentPayload } from "./types.ts";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_BYTES32 = /^0x[0-9a-fA-F]{64}$/;

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing or invalid field: ${key}`);
  }
  return v;
}

export function parseSignedPaymentPayload(body: unknown): SignedPaymentPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }
  const raw = body as Record<string, unknown>;

  const payload: SignedPaymentPayload = {
    t: requireString(raw, "t") as "sp",
    value: requireString(raw, "value"),
    signature: requireString(raw, "signature"),
    tokenAddress: getAddress(requireString(raw, "tokenAddress")),
    posNonce: requireString(raw, "posNonce"),
    from: getAddress(requireString(raw, "from")),
    to: getAddress(requireString(raw, "to")),
    validAfter: requireString(raw, "validAfter"),
    validBefore: requireString(raw, "validBefore"),
    nonce: requireString(raw, "nonce"),
    reqId: requireString(raw, "reqId"),
    posId: requireString(raw, "posId"),
  };

  if (payload.t !== "sp") {
    throw new Error('Invalid payload type (expected t="sp")');
  }
  if (!HEX_BYTES32.test(payload.nonce)) {
    throw new Error("Invalid auth nonce (expected bytes32 hex)");
  }
  if (!HEX_ADDRESS.test(payload.tokenAddress)) {
    throw new Error("Invalid tokenAddress");
  }

  return payload;
}
