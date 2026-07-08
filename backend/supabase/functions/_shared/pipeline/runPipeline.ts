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
import type { PipelineResult, SignedPaymentPayload } from "./types.ts";

export { PIPELINE_STEPS };

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

  const transactionId = insertResult.transactionId;
  const ctx = {
    admin,
    payload,
    transactionId,
    merchantId: pos.merchant_id,
  };

  let finalStatus: "approved" | "declined" | "held" = "approved";
  let reason: string | undefined;
  let txHash: string | undefined;

  for (const stepName of PIPELINE_STEPS) {
    const runner = PIPELINE_STEP_RUNNERS[stepName];
    const outcome = await runner(ctx, config);

    await writeAuditLog(admin, transactionId, pos.merchant_id, stepName, outcome.result, {
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
