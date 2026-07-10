import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireOfficer(req: Request, supabaseUrl: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Authorization required");

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) throw new Error("Invalid session");

  const role = (userData.user.app_metadata as { role?: string })?.role;
  if (role !== "compliance_officer") throw new Error("compliance_officer role required");

  return userClient;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = await requireOfficer(req, supabaseUrl);
    const body = await req.json();
    const action = body.action as string;

    if (action === "freeze") {
      const { data, error } = await client.rpc("compliance_freeze_address", {
        p_address: body.address,
        p_reason: body.reason,
        p_order_ref: body.order_ref ?? null,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, row: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unfreeze") {
      const { data, error } = await client.rpc("compliance_unfreeze_address", {
        p_address: body.address,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, removed: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_suspension") {
      const { data, error } = await client.rpc("compliance_set_system_suspension", {
        p_suspended: Boolean(body.suspended),
        p_reason: body.reason ?? null,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, value: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("required") || message.includes("Invalid") ? 401 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
