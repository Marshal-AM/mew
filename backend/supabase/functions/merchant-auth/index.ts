import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAddress, verifyMessage } from "https://esm.sh/ethers@6.13.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function walletEmail(address: string): string {
  return `${getAddress(address).toLowerCase()}@wallet.moo`;
}

function isComplianceOfficerWallet(address: string): boolean {
  const raw = Deno.env.get("COMPLIANCE_OFFICER_WALLETS") ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  try {
    const normalized = getAddress(address).toLowerCase();
    return allowed.includes(normalized);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(supabaseUrl, anonKey, {
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
    const complianceOfficer = isComplianceOfficerWallet(address);
    const role = complianceOfficer ? "compliance_officer" : "merchant";

    let merchantId: string | null = null;
    if (!complianceOfficer) {
      const { data: merchantRow, error: merchantErr } = await admin
        .from("merchants")
        .upsert(
          { wallet_address: address, name: `Merchant ${address.slice(0, 8)}` },
          { onConflict: "wallet_address" },
        )
        .select("id")
        .single();

      if (merchantErr || !merchantRow) {
        throw merchantErr ?? new Error("merchant upsert failed");
      }
      merchantId = merchantRow.id as string;
    }

    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = listed.users.find((u) => u.email?.toLowerCase() === email);

    if (!user) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { wallet_address: address },
        app_metadata: { role },
      });
      if (createErr || !created.user) {
        throw createErr ?? new Error("createUser failed");
      }
      user = created.user;
    } else {
      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...(user.app_metadata ?? {}), role },
      });
    }

    if (!complianceOfficer && merchantId) {
      await admin.from("merchant_users").upsert(
        { user_id: user.id, merchant_id: merchantId, role: "merchant" },
        { onConflict: "user_id,merchant_id" },
      );
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      throw linkErr ?? new Error("generateLink failed");
    }

    const { data: sessionData, error: sessionErr } = await anon.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (sessionErr || !sessionData.session) {
      throw sessionErr ?? new Error("verifyOtp failed");
    }

    return new Response(
      JSON.stringify({
        session: sessionData.session,
        merchant_id: merchantId,
        wallet_address: address,
        role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
