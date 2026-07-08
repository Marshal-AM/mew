import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { ListSource, SanctionsListEntry } from "./types.ts";

export const UN_SC_LIST: SanctionsListEntry[] = [
  { entity_name: "SANCTIONED TEST ENTITY", aliases: ["Test Bad Actor"] },
  { entity_name: "GLOBAL ARMS TRADER LLC", aliases: ["Arms Trader Global"] },
];

export const UAE_LOCAL_LIST: SanctionsListEntry[] = [
  { entity_name: "UAE TEST LISTED PERSON", aliases: [] },
  { entity_name: "REGIONAL SHELL CORP", aliases: ["Shell Corp Regional"] },
];

export function getBundledList(source: ListSource): SanctionsListEntry[] {
  return source === "un_sc" ? UN_SC_LIST : UAE_LOCAL_LIST;
}

export async function syncListSource(
  admin: SupabaseClient,
  source: ListSource,
  entries: SanctionsListEntry[]
): Promise<number> {
  const { error: deleteErr } = await admin.from("sanctions_cache").delete().eq("list_source", source);
  if (deleteErr) throw new Error(`Failed clearing ${source}: ${deleteErr.message}`);

  const rows = entries.flatMap((entry) => {
    const base = {
      entity_name: entry.entity_name,
      list_source: source,
      metadata: { aliases: entry.aliases ?? [], synced: true },
      last_synced_at: new Date().toISOString(),
    };
    const aliasRows = (entry.aliases ?? []).map((alias) => ({
      entity_name: alias,
      list_source: source,
      metadata: { alias_of: entry.entity_name, synced: true },
      last_synced_at: new Date().toISOString(),
    }));
    return [base, ...aliasRows];
  });

  if (rows.length > 0) {
    const { error: insertErr } = await admin.from("sanctions_cache").insert(rows);
    if (insertErr) throw new Error(`Failed inserting ${source}: ${insertErr.message}`);
  }

  const { error: syncErr } = await admin.from("sanctions_list_sync").upsert({
    list_source: source,
    last_synced_at: new Date().toISOString(),
    entry_count: rows.length,
  });
  if (syncErr) throw new Error(`Failed updating sync metadata for ${source}: ${syncErr.message}`);

  return rows.length;
}

export async function syncAllBundledLists(admin: SupabaseClient) {
  const unScCount = await syncListSource(admin, "un_sc", UN_SC_LIST);
  const uaeCount = await syncListSource(admin, "uae_local", UAE_LOCAL_LIST);
  return { un_sc: unScCount, uae_local: uaeCount };
}
