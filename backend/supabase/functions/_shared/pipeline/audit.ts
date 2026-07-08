import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export async function writeAuditLog(
  admin: SupabaseClient,
  transactionId: string,
  merchantId: string,
  step: string,
  result: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await admin.rpc("insert_audit_log", {
    p_transaction_id: transactionId,
    p_merchant_id: merchantId,
    p_step: step,
    p_result: result,
    p_metadata: metadata,
  });
  if (error) {
    throw new Error(`audit log write failed (${step}): ${error.message}`);
  }
}
