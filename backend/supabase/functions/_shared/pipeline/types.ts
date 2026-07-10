import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  /** Set by POS at relay time only — not part of the wallet signature. */
  productId?: string;
};

export type PipelineHalt = "declined" | "held";

export type StepOutcome = {
  ok: boolean;
  result: string;
  metadata?: Record<string, unknown>;
  halt?: PipelineHalt;
  reason?: string;
};

export type PipelineStepName =
  | "signature.verify"
  | "replay.check"
  | "sanctions.screen"
  | "fraud.velocity"
  | "balance.check"
  | "settlement.relay"
  | "audit.finalize";

export type PipelineContext = {
  admin: SupabaseClient;
  payload: SignedPaymentPayload;
  transactionId: string;
  merchantId: string;
  txHash?: string;
};

export type PipelineResult = {
  status: "approved" | "declined" | "held";
  reqId: string;
  transactionId: string;
  txHash?: string;
  reason?: string;
};

export type ChainConfig = {
  rpcUrl: string;
  relayerPrivateKey: string;
  forwarderAddress: string;
  chainId: number;
};
