import type { ScreenRequest, ScreenResult } from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function callScreenEntity(request: ScreenRequest): Promise<ScreenResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env for screening client");
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/screen-entity`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(request),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? `screen-entity HTTP ${res.status}`);
  }
  return body as ScreenResult;
}

export { corsHeaders };
