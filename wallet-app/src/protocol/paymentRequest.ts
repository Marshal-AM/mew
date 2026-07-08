export type PaymentRequest = {
  posId: string;
  amt: string;
  reqId: string;
  posNonce: string;
  exp: number;
};

export function parsePaymentRequestJson(raw: string): PaymentRequest {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const posId = parsed.posId;
  const amt = parsed.amt;
  const reqId = parsed.reqId;
  const posNonce = parsed.posNonce;
  const exp = parsed.exp;

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
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    throw new Error("Invalid exp");
  }

  return { posId, amt, reqId, posNonce, exp };
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
