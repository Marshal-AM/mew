import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { EntityType } from "./types.ts";

export type ResolvedEntity = {
  entity_id: string;
  entity_type: EntityType;
  screened_name: string;
};

export async function resolveEntity(
  admin: SupabaseClient,
  entity_id: string,
  entity_type: EntityType
): Promise<ResolvedEntity> {
  if (entity_type === "customer") {
    const { data, error } = await admin
      .from("customers")
      .select("id, full_name")
      .eq("id", entity_id)
      .maybeSingle();
    if (error) throw new Error(`Customer lookup failed: ${error.message}`);
    if (!data) throw new Error(`Customer not found: ${entity_id}`);
    return {
      entity_id: data.id,
      entity_type,
      screened_name: data.full_name ?? "",
    };
  }

  const { data, error } = await admin
    .from("merchants")
    .select("id, name")
    .eq("id", entity_id)
    .maybeSingle();
  if (error) throw new Error(`Merchant lookup failed: ${error.message}`);
  if (!data) throw new Error(`Merchant not found: ${entity_id}`);
  return {
    entity_id: data.id,
    entity_type,
    screened_name: data.name ?? "",
  };
}

export async function resolveCustomerByWallet(
  admin: SupabaseClient,
  walletAddress: string
) {
  const { data, error } = await admin
    .from("customers")
    .select("id, full_name, screening_status")
    .eq("wallet_address", walletAddress.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Customer lookup failed: ${error.message}`);
  return data;
}
