import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const posId = url.searchParams.get("pos_id")?.trim();
    if (!posId) {
      return new Response(JSON.stringify({ error: "pos_id query parameter required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: pos, error: posErr } = await admin
      .from("pos_devices")
      .select("merchant_id, active")
      .eq("pos_id", posId)
      .maybeSingle();

    if (posErr) {
      throw posErr;
    }
    if (!pos || !pos.active) {
      return new Response(JSON.stringify({ error: "POS device not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: products, error: productsErr } = await admin
      .from("products")
      .select("id, name, sku, price, pos_slot")
      .eq("merchant_id", pos.merchant_id)
      .eq("active", true)
      .not("pos_slot", "is", null)
      .order("pos_slot");

    if (productsErr) {
      throw productsErr;
    }

    return new Response(
      JSON.stringify({
        pos_id: posId,
        merchant_id: pos.merchant_id,
        products: products ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
