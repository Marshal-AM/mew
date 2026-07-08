import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAddress } from "https://esm.sh/ethers@6.13.0";
import { corsHeaders } from "../_shared/screening/client.ts";
import { screenEntity } from "../_shared/screening/screen.ts";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const wallet_address = body?.wallet_address;
    const full_name = body?.full_name;
    const id_doc_ref = body?.id_doc_ref ?? null;

    if (!wallet_address || !full_name || typeof full_name !== "string") {
      return new Response(JSON.stringify({ error: "wallet_address and full_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const address = getAddress(wallet_address).toLowerCase();
    const { data: customer, error: upsertErr } = await admin
      .from("customers")
      .upsert(
        {
          wallet_address: address,
          full_name: full_name.trim(),
          id_doc_ref,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wallet_address" }
      )
      .select("id")
      .single();

    if (upsertErr || !customer) {
      throw upsertErr ?? new Error("Customer upsert failed");
    }

    const screening = await screenEntity(admin, {
      entity_id: customer.id,
      entity_type: "customer",
    });

    const screening_status = screening.match ? "blocked" : "cleared";
    const { error: updateErr } = await admin
      .from("customers")
      .update({
        screening_status,
        screened_at: new Date().toISOString(),
      })
      .eq("id", customer.id);
    if (updateErr) throw updateErr;

    const payload = {
      customer_id: customer.id,
      screening_status,
      screening,
    };

    if (screening_status === "blocked") {
      return new Response(
        JSON.stringify({
          ...payload,
          error: "Customer blocked by sanctions screening",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
