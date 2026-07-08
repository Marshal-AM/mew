import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { VelocitySnapshot } from "./types.ts";

export function utcWindowDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function readVelocityCounter(
  admin: SupabaseClient,
  wallet: string,
  windowDate = utcWindowDate()
): Promise<VelocitySnapshot> {
  const { data: counter, error } = await admin
    .from("velocity_counters")
    .select("tx_count, cumulative_amount")
    .eq("wallet_address", wallet.toLowerCase())
    .eq("window_date", windowDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Velocity counter read failed: ${error.message}`);
  }

  return {
    txCount: counter?.tx_count ?? 0,
    cumulativeAmount: Number(counter?.cumulative_amount ?? 0),
  };
}

export async function incrementOnApproval(
  admin: SupabaseClient,
  wallet: string,
  amount: number,
  windowDate = utcWindowDate()
): Promise<void> {
  const { error } = await admin.rpc("increment_velocity_counter", {
    p_wallet: wallet.toLowerCase(),
    p_window: windowDate,
    p_amount: amount,
  });

  if (error) {
    throw new Error(`Velocity counter increment failed: ${error.message}`);
  }
}
