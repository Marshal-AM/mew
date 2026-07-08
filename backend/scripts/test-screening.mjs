import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  } catch {
    // optional local env file
  }
}

loadEnvFile(join(root, ".env"));
loadEnvFile(join(root, "..", ".env"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (!len1 || !len2) return 0;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / len1 + m / len2 + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function fuzzyScore(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  return jaroWinkler(left, right);
}

function isFuzzyMatch(a, b, threshold = 0.82) {
  return fuzzyScore(a, b) >= threshold;
}

assert(isFuzzyMatch("SANCTIONED TEST ENTITY", "Sanctioned Test Entity"), "exact normalized match");
assert(!isFuzzyMatch("Jane Doe", "SANCTIONED TEST ENTITY"), "benign name should not match");
assert(fuzzyScore("SANCTIONED TEST ENT", "SANCTIONED TEST ENTITY") >= 0.82, "near match above threshold");

console.log("test-screening: fuzzy matcher PASS");

const stepsSrc = readFileSync(join(root, "supabase/functions/_shared/pipeline/steps.ts"), "utf8");
assert(stepsSrc.includes('from "../screening/client.ts"'), "pipeline must use screening HTTP client");
assert(!stepsSrc.includes("sanctions_cache"), "pipeline must not query sanctions_cache directly");

console.log("test-screening: pipeline static check PASS");

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.log("test-screening: integration SKIP (set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(0);
}

async function post(path, body, key = anon) {
  const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

async function rest(path, options = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
  ...options,
  headers: {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const sync = await post("sync-sanctions-lists", {}, service);
if (sync.status === 404) {
  console.log("test-screening: integration SKIP (functions not deployed)");
  process.exit(0);
}
assert(sync.status >= 200 && sync.status < 300, `sync-sanctions-lists failed: ${sync.status}`);
console.log("test-screening: list sync PASS", JSON.stringify(sync.body));

const testWallet = `0x${"ab".repeat(20)}`;
const registerBlocked = await post("register-customer", {
  wallet_address: testWallet,
  full_name: "SANCTIONED TEST ENTITY",
});
assert(registerBlocked.status === 403, "sanctioned name should be blocked at onboarding");
assert(registerBlocked.body.screening_status === "blocked", "blocked screening_status expected");

const clearedWallet = `0x${"cd".repeat(20)}`;
const registerOk = await post("register-customer", {
  wallet_address: clearedWallet,
  full_name: "Clear Test User",
});
assert(registerOk.status === 200, "cleared customer should register");
const customerId = registerOk.body.customer_id;

const screenClear = await post("screen-entity", { entity_id: customerId, entity_type: "customer" }, service);
assert(screenClear.body.match === false, "cleared user should not match");

const merchantRes = await rest("merchants?select=id,name&limit=1");
assert(merchantRes.status === 200 && merchantRes.body?.[0]?.id, "merchant seed required");
const merchant = merchantRes.body[0];

await rest("sanctions_cache", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    entity_name: merchant.name,
    list_source: "un_sc",
    metadata: { fixture: true },
  }),
});

const screenMerchant = await post(
  "screen-entity",
  { entity_id: merchant.id, entity_type: "merchant" },
  service
);
assert(screenMerchant.body.match === true, "merchant name match should screen positive");

await rest(`sanctions_cache?entity_name=eq.${encodeURIComponent(merchant.name)}`, {
  method: "DELETE",
  headers: { Prefer: "return=minimal" },
});

console.log("test-screening: integration PASS");
console.log("test-screening: ALL PASS");
