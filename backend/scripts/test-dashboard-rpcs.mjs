import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.log("test-dashboard-rpcs: SKIP (set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(0);
}

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonClient = createClient(url, anon);

const DEMO_MERCHANT = "11111111-1111-4111-8111-111111111111";
const OTHER_MERCHANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

await admin.from("merchants").upsert([
  { id: OTHER_MERCHANT, name: "Other", wallet_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
]);

const { data: txs, error: txErr } = await anonClient.rpc("demo_merchant_fetch_transactions", { p_limit: 5 });
if (txErr) throw txErr;
for (const row of txs ?? []) {
  if (row.merchant_id !== DEMO_MERCHANT) {
    throw new Error(`demo_merchant_fetch_transactions leaked merchant ${row.merchant_id}`);
  }
}

const { error: reviewErr } = await anonClient.rpc("compliance_fetch_review_queue", { p_status: "open" });
if (!reviewErr || !reviewErr.message.includes("compliance_officer")) {
  throw new Error("anon should not access compliance_fetch_review_queue");
}

console.log("test-dashboard-rpcs: PASS");
