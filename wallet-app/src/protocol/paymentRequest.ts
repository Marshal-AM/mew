export type PaymentRequest = {
  posId: string;
  amt: string;
  reqId: string;
  posNonce: string;
  exp: number;
  payoutAddress?: string;
};

const RELATIVE_EXP_THRESHOLD = 1_000_000_000;

function pickString(
  parsed: Record<string, unknown>,
  longKey: string,
  shortKey: string,
): unknown {
  const value = parsed[longKey] ?? parsed[shortKey];
  return value;
}

function normalizeExp(rawExp: unknown): number {
  if (typeof rawExp !== "number" || !Number.isFinite(rawExp)) {
    throw new Error("Invalid exp");
  }
  if (rawExp < RELATIVE_EXP_THRESHOLD) {
    return Math.floor(Date.now() / 1000) + rawExp;
  }
  return rawExp;
}

function parseJsonPaymentRequest(raw: string): PaymentRequest {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const posId = pickString(parsed, "posId", "p");
  const amt = pickString(parsed, "amt", "a");
  const reqId = pickString(parsed, "reqId", "r");
  const posNonce = pickString(parsed, "posNonce", "n");
  const expRaw = parsed.exp ?? parsed.e;
  const payoutAddress = pickString(parsed, "payoutAddress", "to");

  if (typeof posId !== "string" || posId.length === 0) {
    throw new Error("Invalid posId");
  }
  if (typeof amt !== "string" || !/^\d+\.\d{2}$/.test(amt)) {
    throw new Error("Invalid amt");
  }
  if (typeof reqId !== "string" || reqId.length === 0) {
    throw new Error("Invalid reqId");
  }
  if (typeof posNonce !== "string" || posNonce.length < 8) {
    throw new Error("Invalid posNonce");
  }

  const exp = normalizeExp(expRaw);

  if (payoutAddress != null && typeof payoutAddress !== "string") {
    throw new Error("Invalid payoutAddress");
  }

  return { posId, amt, reqId, posNonce, exp, payoutAddress: payoutAddress as string | undefined };
}

function parsePipePaymentRequest(raw: string): PaymentRequest {
  const parts = raw.split("|");
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error("Invalid pipe payment request");
  }

  const [posId, amt, reqId, posNonce, expPart, payoutAddress] = parts;
  if (!posId || posId.length === 0) {
    throw new Error("Invalid posId");
  }
  if (!amt || !/^\d+\.\d{2}$/.test(amt)) {
    throw new Error("Invalid amt");
  }
  if (!reqId || reqId.length === 0) {
    throw new Error("Invalid reqId");
  }
  if (!posNonce || posNonce.length < 8) {
    throw new Error("Invalid posNonce");
  }

  const ttlSec = Number(expPart);
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
    throw new Error("Invalid exp");
  }

  const exp = normalizeExp(ttlSec);

  return { posId, amt, reqId, posNonce, exp, payoutAddress };
}

export function parsePaymentRequestJson(raw: string): PaymentRequest {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return parseJsonPaymentRequest(trimmed);
  }
  if (trimmed.includes("|")) {
    return parsePipePaymentRequest(trimmed);
  }
  throw new Error("Unsupported payment request format");
}

export function buildPhase4TestPayload(request: PaymentRequest, targetBytes = 1500): string {
  const base = {
    test: true,
    posId: request.posId,
    posNonce: request.posNonce,
    reqId: request.reqId,
    amt: request.amt,
    pad: "",
  };

  let json = JSON.stringify(base);
  while (json.length < targetBytes) {
    base.pad = `${base.pad}x`;
    json = JSON.stringify(base);
  }
  return json;
}
