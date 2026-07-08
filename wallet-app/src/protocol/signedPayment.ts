import type { PaymentRequest } from "./paymentRequest";
import type { TransferMessage } from "../wallet/eip712";

export type SignedPaymentPayload = {
  t: "sp";
  value: string;
  signature: string;
  tokenAddress: string;
  posNonce: string;
  from: string;
  to: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  reqId: string;
  posId: string;
};

export function buildSignedPaymentPayload(
  request: PaymentRequest,
  message: TransferMessage,
  signature: string
): SignedPaymentPayload {
  return {
    t: "sp",
    value: message.value.toString(),
    signature,
    tokenAddress: message.token,
    posNonce: request.posNonce,
    from: message.from,
    to: message.to,
    validAfter: message.validAfter.toString(),
    validBefore: message.validBefore.toString(),
    nonce: message.nonce,
    reqId: request.reqId,
    posId: request.posId,
  };
}

export function serializeSignedPayment(payload: SignedPaymentPayload): string {
  return JSON.stringify(payload);
}
