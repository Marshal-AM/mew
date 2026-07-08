import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { fuzzyScore, getMatchThreshold } from "./fuzzy.ts";
import { resolveEntity } from "./resolve.ts";
import type { ListSource, SanctionsCacheRow, ScreenRequest, ScreenResult } from "./types.ts";

function collectCandidateNames(row: SanctionsCacheRow): string[] {
  const names = [row.entity_name];
  const aliases = row.metadata?.aliases;
  if (Array.isArray(aliases)) {
    for (const alias of aliases) {
      if (typeof alias === "string" && alias.trim()) {
        names.push(alias);
      }
    }
  }
  return names;
}

export async function screenAgainstCache(
  screenedName: string,
  rows: SanctionsCacheRow[]
): Promise<ScreenResult> {
  const threshold = getMatchThreshold();
  let bestScore = 0;
  let bestSource: ListSource | null = null;
  let bestMatch: string | undefined;

  if (!screenedName.trim()) {
    return {
      match: false,
      score: 0,
      list_source: null,
      screened_name: screenedName,
    };
  }

  for (const row of rows) {
    for (const candidate of collectCandidateNames(row)) {
      const score = fuzzyScore(screenedName, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestSource = row.list_source;
        bestMatch = candidate;
      }
    }
  }

  return {
    match: bestScore >= threshold,
    score: Number(bestScore.toFixed(4)),
    list_source: bestScore >= threshold ? bestSource : null,
    screened_name: screenedName,
    matched_name: bestScore >= threshold ? bestMatch : undefined,
  };
}

export async function screenEntity(
  admin: SupabaseClient,
  request: ScreenRequest
): Promise<ScreenResult> {
  const resolved = await resolveEntity(admin, request.entity_id, request.entity_type);
  const { data, error } = await admin
    .from("sanctions_cache")
    .select("entity_name, list_source, metadata");
  if (error) throw new Error(`Sanctions cache lookup failed: ${error.message}`);

  return screenAgainstCache(resolved.screened_name, (data ?? []) as SanctionsCacheRow[]);
}
