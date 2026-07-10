/**
 * Verifies held transactions with signed_payload can be resumed via resume-transaction edge function.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPLIANCE_OFFICER_JWT (access token with compliance_officer role)
 */
const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const officerJwt = process.env.COMPLIANCE_OFFICER_JWT;

if (!url || !service) {
  console.log("test-review-release: SKIP (set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(0);
}

if (!officerJwt) {
  console.log("test-review-release: SKIP (set COMPLIANCE_OFFICER_JWT for full E2E)");
  process.exit(0);
}

const txId = process.env.TEST_TX_ID;
if (!txId) {
  console.log("test-review-release: SKIP (set TEST_TX_ID to a pending_review transaction with signed_payload)");
  process.exit(0);
}

const fnUrl = `${url}/functions/v1/resume-transaction`;
const res = await fetch(fnUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${officerJwt}`,
    apikey: process.env.SUPABASE_ANON_KEY ?? "",
  },
  body: JSON.stringify({ transaction_id: txId }),
});
const json = await res.json();
if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
if (json.status !== "approved" && json.status !== "declined" && json.status !== "held") {
  throw new Error(`unexpected status: ${JSON.stringify(json)}`);
}
console.log("test-review-release: PASS", json.status);
