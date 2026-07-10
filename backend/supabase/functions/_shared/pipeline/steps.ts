import { getAddress, verifyTypedData } from "https://esm.sh/ethers@6.13.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callScreenEntity } from "../screening/client.ts";
import { resolveCustomerByWallet } from "../screening/resolve.ts";
import { evaluateFraudRules } from "../fraud/evaluate.ts";
import { readVelocityCounter } from "../fraud/velocity.ts";
import { buildDomain } from "./eip712.ts";
import {
  createChainClients,
  getTokenBalance,
  isAuthorizationUsed,
  loadChainConfig,
  relayTransferWithAuthorization,
} from "./chain.ts";
import type {
  ChainConfig,
  PipelineContext,
  PipelineStepName,
  SignedPaymentPayload,
  StepOutcome,
} from "./types.ts";

const TERMINAL_STATUSES = ["confirmed", "declined", "pending_review", "held"];

function transferMessage(payload: SignedPaymentPayload) {
  return {
    token: payload.tokenAddress,
    from: payload.from,
    to: payload.to,
    value: BigInt(payload.value),
    validAfter: BigInt(payload.validAfter),
    validBefore: BigInt(payload.validBefore),
    nonce: payload.nonce,
  };
}

export async function stepSignatureVerify(ctx: PipelineContext, config: ChainConfig): Promise<StepOutcome> {
  const { payload, admin } = ctx;
  const domain = buildDomain(config.chainId, config.forwarderAddress);
  const types = {
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
  const message = transferMessage(payload);

  let recovered: string;
  try {
    recovered = verifyTypedData(domain, types, message, payload.signature);
  } catch (err) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Invalid EIP-712 signature",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  if (getAddress(recovered) !== getAddress(payload.from)) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Signer does not match payer address",
      metadata: { recovered, expected: payload.from },
    };
  }

  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("wallet_address", getAddress(payload.from).toLowerCase())
    .maybeSingle();

  if (!existing) {
    const { error } = await admin.from("customers").insert({
      wallet_address: getAddress(payload.from).toLowerCase(),
      risk_rating: "low",
    });
    if (error) {
      return {
        ok: false,
        result: "fail",
        halt: "declined",
        reason: "Customer registration failed",
        metadata: { error: error.message },
      };
    }
  }

  return {
    ok: true,
    result: "pass",
    metadata: { signer: getAddress(recovered) },
  };
}

export async function stepReplayCheck(ctx: PipelineContext, config: ChainConfig): Promise<StepOutcome> {
  const { payload, admin, transactionId } = ctx;
  const { forwarder } = createChainClients(config);

  const { data: dupPos } = await admin
    .from("transactions")
    .select("id, status")
    .eq("pos_id", payload.posId)
    .eq("pos_nonce", payload.posNonce)
    .neq("id", transactionId)
    .maybeSingle();

  if (dupPos && TERMINAL_STATUSES.includes(dupPos.status)) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "POS nonce replay detected",
      metadata: { existingId: dupPos.id },
    };
  }

  const { data: dupAuth } = await admin
    .from("transactions")
    .select("id, status")
    .eq("token_address", payload.tokenAddress)
    .eq("from_address", payload.from)
    .eq("auth_nonce", payload.nonce)
    .neq("id", transactionId)
    .maybeSingle();

  if (dupAuth && TERMINAL_STATUSES.includes(dupAuth.status)) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Auth nonce replay detected",
      metadata: { existingId: dupAuth.id },
    };
  }

  try {
    const used = await isAuthorizationUsed(forwarder, payload.tokenAddress, payload.from, payload.nonce);
    if (used) {
      return {
        ok: false,
        result: "fail",
        halt: "declined",
        reason: "Authorization already used on-chain",
      };
    }
  } catch (err) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "On-chain replay check failed",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  return { ok: true, result: "pass" };
}

export async function stepSanctionsScreen(ctx: PipelineContext): Promise<StepOutcome> {
  const { payload, admin, merchantId } = ctx;
  const addresses = [payload.from, payload.to].map((a) => a.toLowerCase());

  const { data: allFrozen, error } = await admin.from("frozen_addresses").select("address, reason, freeze_type");

  if (error) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Frozen address lookup failed",
      metadata: { error: error.message },
    };
  }

  const frozen = (allFrozen ?? []).filter((row) => addresses.includes(row.address.toLowerCase()));
  if (frozen.length > 0) {
    return {
      ok: false,
      result: "flagged",
      halt: "held",
      reason: "Wallet flagged by address freeze",
      metadata: { matches: frozen },
    };
  }

  const payer = await resolveCustomerByWallet(admin, getAddress(payload.from));
  if (!payer?.full_name || payer.screening_status !== "cleared") {
    return {
      ok: false,
      result: "flagged",
      halt: "held",
      reason: "Payer KYC screening incomplete or not cleared",
      metadata: { wallet: payload.from, screening_status: payer?.screening_status ?? "missing" },
    };
  }

  const payerScreen = await callScreenEntity({
    entity_id: payer.id,
    entity_type: "customer",
  });
  if (payerScreen.match) {
    return {
      ok: false,
      result: "flagged",
      halt: "held",
      reason: "Payer matched sanctions list",
      metadata: { role: "payer", screening: payerScreen },
    };
  }

  const payeeScreen = await callScreenEntity({
    entity_id: merchantId,
    entity_type: "merchant",
  });
  if (payeeScreen.match) {
    return {
      ok: false,
      result: "flagged",
      halt: "held",
      reason: "Payee matched sanctions list",
      metadata: { role: "payee", screening: payeeScreen },
    };
  }

  return {
    ok: true,
    result: "pass",
    metadata: { payer: payerScreen, payee: payeeScreen },
  };
}

export async function stepFraudVelocity(ctx: PipelineContext): Promise<StepOutcome> {
  const { payload, admin } = ctx;
  const wallet = payload.from.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const amount = Number(payload.value) / 1e6;

  const { data: rules, error: rulesErr } = await admin
    .from("fraud_rules")
    .select("rule_type, threshold_value, merchant_id")
    .eq("active", true)
    .or(`merchant_id.is.null,merchant_id.eq.${ctx.merchantId}`);

  if (rulesErr) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Fraud rules lookup failed",
      metadata: { error: rulesErr.message },
    };
  }

  let snapshot;
  try {
    snapshot = await readVelocityCounter(admin, wallet, today);
  } catch (err) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Velocity counter read failed",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  const check = evaluateFraudRules(rules ?? [], amount, snapshot, wallet);
  if (!check.ok) {
    return {
      ok: false,
      result: "flagged",
      halt: "held",
      reason: check.reason,
      metadata: check.metadata,
    };
  }

  return {
    ok: true,
    result: "pass",
    metadata: {
      projectedCount: check.projectedCount,
      projectedAmount: check.projectedAmount,
      rulesChecked: check.rulesChecked,
    },
  };
}

export async function stepBalanceCheck(ctx: PipelineContext, config: ChainConfig): Promise<StepOutcome> {
  const { payload } = ctx;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = Number(payload.validAfter);
  const validBefore = Number(payload.validBefore);

  if (now < validAfter) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Authorization not yet valid",
      metadata: { now, validAfter },
    };
  }
  if (now > validBefore) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Authorization expired",
      metadata: { now, validBefore },
    };
  }

  const { provider } = createChainClients(config);
  try {
    const balance = await getTokenBalance(provider, payload.tokenAddress, payload.from);
    if (balance < BigInt(payload.value)) {
      return {
        ok: false,
        result: "fail",
        halt: "declined",
        reason: "Insufficient token balance",
        metadata: { balance: balance.toString(), required: payload.value },
      };
    }
  } catch (err) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "Balance check failed",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  return { ok: true, result: "pass" };
}

export async function stepSettlementRelay(ctx: PipelineContext, config: ChainConfig): Promise<StepOutcome> {
  const { payload } = ctx;
  const { forwarder } = createChainClients(config);

  try {
    const txHash = await relayTransferWithAuthorization(forwarder, payload);
    ctx.txHash = txHash;
    return { ok: true, result: "pass", metadata: { txHash } };
  } catch (err) {
    return {
      ok: false,
      result: "fail",
      halt: "declined",
      reason: "On-chain settlement failed",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function stepAuditFinalize(_ctx: PipelineContext): Promise<StepOutcome> {
  return { ok: true, result: "pass" };
}

export type StepRunner = (
  ctx: PipelineContext,
  config: ChainConfig
) => Promise<StepOutcome>;

export const PIPELINE_STEP_RUNNERS: Record<PipelineStepName, StepRunner> = {
  "signature.verify": stepSignatureVerify,
  "replay.check": stepReplayCheck,
  "sanctions.screen": stepSanctionsScreen,
  "fraud.velocity": stepFraudVelocity,
  "balance.check": stepBalanceCheck,
  "settlement.relay": stepSettlementRelay,
  "audit.finalize": stepAuditFinalize,
};

export const PIPELINE_STEPS: PipelineStepName[] = [
  "signature.verify",
  "replay.check",
  "sanctions.screen",
  "fraud.velocity",
  "balance.check",
  "settlement.relay",
  "audit.finalize",
];

export async function resolvePosDevice(admin: SupabaseClient, posId: string) {
  const { data, error } = await admin
    .from("pos_devices")
    .select("pos_id, merchant_id, payout_address, active")
    .eq("pos_id", posId)
    .maybeSingle();

  if (error) throw new Error(`POS lookup failed: ${error.message}`);
  if (!data || !data.active) throw new Error(`POS device not found or inactive: ${posId}`);
  return data;
}

async function resolvePosProduct(
  admin: SupabaseClient,
  merchantId: string,
  productId?: string
): Promise<{ product_id?: string; product_name?: string }> {
  if (!productId) {
    return {};
  }

  const { data: product, error } = await admin
    .from("products")
    .select("id, name, merchant_id, active")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`Product lookup failed: ${error.message}`);
  }
  if (!product || !product.active || product.merchant_id !== merchantId) {
    throw new Error("Invalid or inactive product for this POS merchant");
  }

  return { product_id: product.id as string, product_name: product.name as string };
}

export async function insertTransaction(
  admin: SupabaseClient,
  payload: SignedPaymentPayload,
  merchantId: string
) {
  const product = await resolvePosProduct(admin, merchantId, payload.productId);

  const signedPayload = {
    t: payload.t,
    value: payload.value,
    signature: payload.signature,
    tokenAddress: payload.tokenAddress,
    posNonce: payload.posNonce,
    from: payload.from,
    to: payload.to,
    validAfter: payload.validAfter,
    validBefore: payload.validBefore,
    nonce: payload.nonce,
    reqId: payload.reqId,
    posId: payload.posId,
    ...(payload.productId ? { productId: payload.productId } : {}),
  };

  const { data, error } = await admin
    .from("transactions")
    .insert({
      pos_id: payload.posId,
      merchant_id: merchantId,
      req_id: payload.reqId,
      pos_nonce: payload.posNonce,
      auth_nonce: payload.nonce,
      amount: Number(payload.value) / 1e6,
      token_address: payload.tokenAddress,
      from_address: payload.from.toLowerCase(),
      to_address: payload.to.toLowerCase(),
      status: "pending",
      product_id: product.product_id ?? null,
      product_name: product.product_name ?? null,
      signed_payload: signedPayload,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { duplicate: true as const, error };
    }
    throw new Error(`Transaction insert failed: ${error.message}`);
  }
  return { duplicate: false as const, transactionId: data.id as string };
}

export async function enqueueReview(admin: SupabaseClient, transactionId: string, reason: string) {
  const { error } = await admin.from("review_queue").insert({
    transaction_id: transactionId,
    status: "open",
    resolution: reason,
  });
  if (error) {
    console.error("review_queue insert failed:", error.message);
  }
}
