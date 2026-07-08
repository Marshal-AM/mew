import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAddress, verifyMessage } from "https://esm.sh/ethers@6.13.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function walletEmail(address: string): string {
  return `${getAddress(address).toLowerCase()}@wallet.moo`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    if (req.method === "GET") {
      const nonce = crypto.randomUUID();
      return new Response(JSON.stringify({ nonce }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, signature } = await req.json();
    if (!message || !signature) {
      return new Response(JSON.stringify({ error: "message and signature required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recovered = verifyMessage(message, signature);
    const address = getAddress(recovered);
    const email = walletEmail(address);

    const { data: merchantRow, error: merchantErr } = await admin
      .from("merchants")
      .upsert(
        { wallet_address: address, name: `Merchant ${address.slice(0, 8)}` },
        { onConflict: "wallet_address" }
      )
      .select("id")
      .single();

    if (merchantErr || !merchantRow) {
      throw merchantErr ?? new Error("merchant upsert failed");
    }

    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = listed.users.find((u) => u.email?.toLowerCase() === email);

    if (!user) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { wallet_address: address },
        app_metadata: { role: "merchant" },
      });
      if (createErr || !created.user) {
        throw createErr ?? new Error("createUser failed");
      }
      user = created.user;
    }

    await admin.from("merchant_users").upsert(
      { user_id: user.id, merchant_id: merchantRow.id, role: "merchant" },
      { onConflict: "user_id,merchant_id" }
    );

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw linkErr ?? new Error("generateLink failed");
    }

    const { data: sessionData, error: sessionErr } = await admin.auth.verifyOtp({
      type: "magiclink",
      email,
      token: linkData.properties.hashed_token,
    });
    if (sessionErr || !sessionData.session) {
      throw sessionErr ?? new Error("verifyOtp failed");
    }

    return new Response(
      JSON.stringify({
        session: sessionData.session,
        merchant_id: merchantRow.id,
        wallet_address: address,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
