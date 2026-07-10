import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeAuditLog } from "./audit.ts";
import { loadChainConfig } from "./chain.ts";
import { incrementOnApproval } from "../fraud/velocity.ts";
import {
  PIPELINE_STEPS,
  PIPELINE_STEP_RUNNERS,
  enqueueReview,
  insertTransaction,
  resolvePosDevice,
} from "./steps.ts";
import type { PipelineResult, PipelineStepName, SignedPaymentPayload } from "./types.ts";
import { parseSignedPaymentPayload } from "./payload.ts";

export { PIPELINE_STEPS };

const RESUME_STEPS: PipelineStepName[] = [
  "balance.check",
  "settlement.relay",
  "audit.finalize",
];

async function isSystemSuspended(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "system_suspended")
    .maybeSingle();
  return Boolean(data?.value && (data.value as { suspended?: boolean }).suspended === true);
}

export async function runPipeline(
  admin: SupabaseClient,
  payload: SignedPaymentPayload
): Promise<PipelineResult> {
  const config = loadChainConfig();
  const pos = await resolvePosDevice(admin, payload.posId);

  if (pos.payout_address.toLowerCase() !== payload.to.toLowerCase()) {
    return {
      status: "declined",
      reqId: payload.reqId,
      transactionId: "",
      reason: "Payee address does not match POS payout address",
    };
  }

  if (await isSystemSuspended(admin)) {
    const insertResult = await insertTransaction(admin, payload, pos.merchant_id);
    if (!insertResult.duplicate) {
      await enqueueReview(admin, insertResult.transactionId, "System-wide suspension active");
      await admin
        .from("transactions")
        .update({ status: "pending_review" })
        .eq("id", insertResult.transactionId);
      return {
        status: "held",
        reqId: payload.reqId,
        transactionId: insertResult.transactionId,
        reason: "System-wide suspension active",
      };
    }
  }

  const insertResult = await insertTransaction(admin, payload, pos.merchant_id);

  if (insertResult.duplicate) {
    const { data: existing } = await admin
      .from("transactions")
      .select("id, status")
      .eq("pos_id", payload.posId)
      .eq("pos_nonce", payload.posNonce)
      .maybeSingle();

    if (existing) {
      await writeAuditLog(admin, existing.id, pos.merchant_id, "replay.check", "fail", {
        reason: "Duplicate submission at insert",
      });
      await admin
        .from("transactions")
        .update({ status: "declined" })
        .eq("id", existing.id)
        .eq("status", "pending");

      return {
        status: "declined",
        reqId: payload.reqId,
        transactionId: existing.id,
        reason: "Duplicate POS nonce submission",
      };
    }

    return {
      status: "declined",
      reqId: payload.reqId,
      transactionId: "",
      reason: "Duplicate transaction (unique constraint violation)",
    };
  }

  return executePipelineFromStep(admin, payload, insertResult.transactionId, pos.merchant_id, PIPELINE_STEPS);
}

export async function resumePipeline(
  admin: SupabaseClient,
  transactionId: string
): Promise<PipelineResult> {
  const { data: row, error } = await admin
    .from("transactions")
    .select("id, merchant_id, status, signed_payload")
    .eq("id", transactionId)
    .maybeSingle();

  if (error || !row) {
    throw new Error("Transaction not found");
  }
  if (row.status !== "pending_review") {
    throw new Error(`Transaction not resumable (status=${row.status})`);
  }
  if (!row.signed_payload) {
    throw new Error("Missing signed_payload for resume");
  }

  const payload = parseSignedPaymentPayload(row.signed_payload);
  return executePipelineFromStep(admin, payload, transactionId, row.merchant_id as string, RESUME_STEPS);
}

async function executePipelineFromStep(
  admin: SupabaseClient,
  payload: SignedPaymentPayload,
  transactionId: string,
  merchantId: string,
  steps: PipelineStepName[]
): Promise<PipelineResult> {
  const config = loadChainConfig();
  const ctx = { admin, payload, transactionId, merchantId };

  let finalStatus: "approved" | "declined" | "held" = "approved";
  let reason: string | undefined;
  let txHash: string | undefined;

  for (const stepName of steps) {
    const runner = PIPELINE_STEP_RUNNERS[stepName];
    const outcome = await runner(ctx, config);

    await writeAuditLog(admin, transactionId, merchantId, stepName, outcome.result, {
      ...(outcome.metadata ?? {}),
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    });

    if (!outcome.ok) {
      if (outcome.halt === "held") {
        finalStatus = "held";
        reason = outcome.reason;
        await enqueueReview(admin, transactionId, outcome.reason ?? "held for review");
        break;
      }
      finalStatus = "declined";
      reason = outcome.reason;
      break;
    }

    if (stepName === "settlement.relay" && ctx.txHash) {
      txHash = ctx.txHash;
    }
  }

  if (finalStatus === "approved") {
    try {
      await incrementOnApproval(admin, payload.from, Number(payload.value) / 1e6);
    } catch (err) {
      console.error("velocity counter increment failed after approval:", err);
    }
    await admin
      .from("review_queue")
      .update({ status: "resolved", resolution: "released and settled", updated_at: new Date().toISOString() })
      .eq("transaction_id", transactionId)
      .in("status", ["open", "assigned"]);
  }

  const dbStatus =
    finalStatus === "approved" ? "confirmed" : finalStatus === "held" ? "pending_review" : "declined";

  const updatePayload: Record<string, unknown> = { status: dbStatus };
  if (txHash) {
    updatePayload.tx_hash = txHash;
    updatePayload.confirmed_at = new Date().toISOString();
  }

  await admin.from("transactions").update(updatePayload).eq("id", transactionId);

  return {
    status: finalStatus,
    reqId: payload.reqId,
    transactionId,
    txHash,
    reason,
  };
}
