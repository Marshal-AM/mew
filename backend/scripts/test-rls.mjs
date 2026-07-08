import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.log("test-rls: SKIP (set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(0);
}

const anonClient = createClient(url, anon);
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const merchantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const { error: merchantErr } = await admin.from("merchants").upsert([
  { id: merchantA, name: "API Test A", wallet_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
]);
if (merchantErr) throw merchantErr;

const { error: posErr } = await admin.from("pos_devices").upsert([
  {
    pos_id: "POS-RLS-A",
    merchant_id: merchantA,
    payout_address: "0x1111111111111111111111111111111111111111",
    label: "A",
    active: true,
  },
]);
if (posErr) throw posErr;

const { data: publicRows, error: publicErr } = await anonClient.from("pos_devices_public").select("pos_id");
if (publicErr) throw publicErr;
if (!publicRows?.some((r) => r.pos_id === "POS-RLS-A")) {
  throw new Error("anon should read active pos via public view (run backend/supabase/disable-rls.sql if RLS still enabled)");
}

const { data: auditRow, error: insertErr } = await anonClient
  .from("audit_log")
  .insert({
    merchant_id: merchantA,
    step: "test",
    result: "ok",
    metadata: { source: "test-rls" },
  })
  .select("id")
  .single();
if (insertErr) throw insertErr;

const { error: updateErr } = await anonClient
  .from("audit_log")
  .update({ result: "updated" })
  .eq("id", auditRow.id);
if (updateErr) throw updateErr;

const { error: deleteErr } = await anonClient.from("audit_log").delete().eq("id", auditRow.id);
if (deleteErr) throw deleteErr;

console.log("test-rls: PASS (open access, no RLS)");
