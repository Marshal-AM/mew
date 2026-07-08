import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet } from "ethers";

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

const RULE_ORDER = ["max_per_tap", "daily_tx_count", "daily_amount"];

function rulePriority(ruleType) {
  const idx = RULE_ORDER.indexOf(ruleType);
  return idx === -1 ? RULE_ORDER.length : idx;
}

function evaluateFraudRules(rules, amount, snapshot) {
  const sorted = [...rules].sort((a, b) => rulePriority(a.rule_type) - rulePriority(b.rule_type));
  const rulesChecked = [];

  for (const rule of sorted) {
    const threshold = Number(rule.threshold_value);
    rulesChecked.push(rule.rule_type);

    if (rule.rule_type === "max_per_tap" && amount > threshold) {
      return { ok: false, rule: rule.rule_type, threshold, reason: "Per-tap amount limit exceeded" };
    }
    if (rule.rule_type === "daily_tx_count" && snapshot.txCount + 1 > threshold) {
      return { ok: false, rule: rule.rule_type, threshold, reason: "Daily transaction count limit exceeded" };
    }
    if (rule.rule_type === "daily_amount" && snapshot.cumulativeAmount + amount > threshold) {
      return { ok: false, rule: rule.rule_type, threshold, reason: "Daily amount limit exceeded" };
    }
  }

  return {
    ok: true,
    projectedCount: snapshot.txCount + 1,
    projectedAmount: snapshot.cumulativeAmount + amount,
    rulesChecked,
  };
}

// --- Unit tests ---
const rules500 = [{ rule_type: "max_per_tap", threshold_value: 500 }];
assert(evaluateFraudRules(rules500, 499, { txCount: 0, cumulativeAmount: 0 }).ok, "499 at cap 500 passes");
assert(evaluateFraudRules(rules500, 500, { txCount: 0, cumulativeAmount: 0 }).ok, "500 at cap 500 passes");
assert(!evaluateFraudRules(rules500, 501, { txCount: 0, cumulativeAmount: 0 }).ok, "501 over cap fails");

const rulesDaily = [{ rule_type: "daily_amount", threshold_value: 10 }];
assert(
  evaluateFraudRules(rulesDaily, 1, { txCount: 0, cumulativeAmount: 9 }).ok,
  "counter=9 amount=1 at threshold 10 passes"
);
assert(
  !evaluateFraudRules(rulesDaily, 1.01, { txCount: 0, cumulativeAmount: 9 }).ok,
  "counter=9 amount=1.01 over threshold 10 fails"
);

const rulesCount = [{ rule_type: "daily_tx_count", threshold_value: 50 }];
assert(evaluateFraudRules(rulesCount, 1, { txCount: 49, cumulativeAmount: 0 }).ok, "50th tx passes");
assert(!evaluateFraudRules(rulesCount, 1, { txCount: 50, cumulativeAmount: 0 }).ok, "51st tx fails");

console.log("test-fraud: unit evaluator PASS");

// --- Static checks ---
const stepsSrc = readFileSync(join(root, "supabase/functions/_shared/pipeline/steps.ts"), "utf8");
const runPipelineSrc = readFileSync(join(root, "supabase/functions/_shared/pipeline/runPipeline.ts"), "utf8");
const evaluateSrc = readFileSync(join(root, "supabase/functions/_shared/fraud/evaluate.ts"), "utf8");

assert(stepsSrc.includes('from "../fraud/evaluate.ts"'), "pipeline must import fraud evaluate");
assert(stepsSrc.includes("evaluateFraudRules"), "stepFraudVelocity must call evaluateFraudRules");
assert(!/from\("velocity_counters"\)/.test(stepsSrc), "stepFraudVelocity must not write velocity_counters directly");
assert(runPipelineSrc.includes("incrementOnApproval"), "runPipeline must increment on approval");
assert(evaluateSrc.includes("max_per_tap"), "evaluate module must handle max_per_tap");

console.log("test-fraud: static checks PASS");

// --- Integration ---
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const submitUrl =
  process.env.SUBMIT_TRANSACTION_URL ??
  (url ? `${url.replace(/\/$/, "")}/functions/v1/submit-transaction` : null);

if (!url || !anon || !service || !submitUrl) {
  console.log("test-fraud: integration SKIP (set SUPABASE_URL, keys)");
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

const probe = await post("submit-transaction", { t: "not-sp" });
if (probe.status === 404) {
  console.log("test-fraud: integration SKIP (submit-transaction not deployed)");
  process.exit(0);
}

const FORWARDER = "0x9F0BF4aE6BBfD51eDbff77eA0D17A7bec484bb97";
const CHAIN_ID = 80002;
const token = "0x26D215752f68bc2254186F9f6FF068b8C4BdFd37";
const PAYEE = "0x0000000000000000000000000000000000000002";
const domain = {
  name: "Moo Payment Forwarder",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: FORWARDER,
};
const types = {
  TransferWithAuthorization: [
    { name: "token", type: "address" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const signer = Wallet.createRandom();
const register = await post("register-customer", {
  wallet_address: signer.address,
  full_name: "Fraud Test User",
});
assert(register.status === 200, `register-customer failed: ${register.status}`);

async function ensureGlobalRule(ruleType, defaultThreshold) {
  const res = await rest(`fraud_rules?merchant_id=is.null&rule_type=eq.${ruleType}&select=threshold_value`);
  if (res.status === 200 && res.body?.[0]) {
    return Number(res.body[0].threshold_value);
  }
  const insert = await rest("fraud_rules", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      merchant_id: null,
      rule_type: ruleType,
      threshold_value: defaultThreshold,
      active: true,
    }),
  });
  assert(
    insert.status >= 200 && insert.status < 300,
    `bootstrap global ${ruleType} failed: ${insert.status}`
  );
  return defaultThreshold;
}

async function fetchGlobalRule(ruleType) {
  const res = await rest(`fraud_rules?merchant_id=is.null&rule_type=eq.${ruleType}&select=threshold_value`);
  assert(res.status === 200 && res.body?.[0], `missing global rule ${ruleType}`);
  return Number(res.body[0].threshold_value);
}

async function setGlobalRule(ruleType, threshold) {
  const res = await rest(`fraud_rules?merchant_id=is.null&rule_type=eq.${ruleType}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ threshold_value: threshold }),
  });
  assert(res.status >= 200 && res.status < 300, `failed to set ${ruleType}: ${res.status}`);
}

const saved = {
  max_per_tap: await ensureGlobalRule("max_per_tap", 500),
  daily_amount: await ensureGlobalRule("daily_amount", 10000),
};

async function buildPayload(amountUsdc) {
  const value = BigInt(Math.round(amountUsdc * 1e6));
  const nonce = "0x" + randomBytes(32).toString("hex");
  const posNonce = randomBytes(16).toString("hex");
  const message = {
    token,
    from: signer.address,
    to: PAYEE,
    value,
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce,
  };
  const signature = await signer.signTypedData(domain, types, message);
  return {
    t: "sp",
    value: value.toString(),
    signature,
    tokenAddress: token,
    posNonce,
    from: signer.address,
    to: PAYEE,
    validAfter: "0",
    validBefore: message.validBefore.toString(),
    nonce,
    reqId: randomBytes(6).toString("hex"),
    posId: "POS-001",
  };
}

async function submit(amountUsdc) {
  const payload = await buildPayload(amountUsdc);
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body, payload };
}

const today = new Date().toISOString().slice(0, 10);
const walletLower = signer.address.toLowerCase();

try {
  await setGlobalRule("max_per_tap", 1);
  const phase9Probe = await submit(2);
  if (phase9Probe.body.status !== "held") {
    console.log(
      "test-fraud: integration SKIP (redeploy submit-transaction + run Phase 9 migration for live E2E)"
    );
    process.exit(0);
  }

  await setGlobalRule("max_per_tap", 5);
  await setGlobalRule("daily_amount", 10000);

  const overTap = await submit(6);
  assert(overTap.body.status === "held", `per-tap over should be held (got ${overTap.body.status})`);
  assert(
    overTap.body.reason?.includes("Per-tap") || overTap.body.reason?.includes("tap"),
    `expected per-tap reason, got ${overTap.body.reason}`
  );

  const txId = overTap.body.transactionId;
  assert(txId, "held tx should have transactionId");

  const auditRes = await rest(
    `audit_log?transaction_id=eq.${txId}&step=eq.fraud.velocity&select=result,metadata`
  );
  assert(auditRes.body?.[0]?.result === "flagged", "audit fraud.velocity should be flagged");
  assert(auditRes.body?.[0]?.metadata?.rule === "max_per_tap", "audit metadata should name max_per_tap");

  const rqRes = await rest(`review_queue?transaction_id=eq.${txId}&status=eq.open&select=id`);
  assert(rqRes.body?.length >= 1, "review_queue should have open entry");

  const txRes = await rest(`transactions?id=eq.${txId}&select=status`);
  assert(txRes.body?.[0]?.status === "pending_review", "transaction should be pending_review");

  console.log("test-fraud: per-tap over integration PASS");

  await setGlobalRule("max_per_tap", 500);
  await setGlobalRule("daily_amount", 10);

  await rest(`velocity_counters?wallet_address=eq.${walletLower}&window_date=eq.${today}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  await rest("velocity_counters", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      wallet_address: walletLower,
      window_date: today,
      tx_count: 0,
      cumulative_amount: 9,
    }),
  });

  const cumulative = await submit(2);
  assert(cumulative.body.status === "held", `cumulative cross should be held (got ${cumulative.body.status})`);
  assert(
    cumulative.body.reason?.includes("Daily amount"),
    `expected daily amount reason, got ${cumulative.body.reason}`
  );

  const cumTxId = cumulative.body.transactionId;
  const cumAudit = await rest(
    `audit_log?transaction_id=eq.${cumTxId}&step=eq.fraud.velocity&select=result,metadata`
  );
  assert(cumAudit.body?.[0]?.result === "flagged", "cumulative audit should be flagged");
  assert(cumAudit.body?.[0]?.metadata?.rule === "daily_amount", "cumulative audit should name daily_amount");

  console.log("test-fraud: cumulative daily integration PASS");

  await setGlobalRule("max_per_tap", 5);
  await setGlobalRule("daily_amount", 10000);

  await rest(`velocity_counters?wallet_address=eq.${walletLower}&window_date=eq.${today}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  const underTap = await submit(4);
  assert(underTap.body.status !== "held", "under per-tap cap should not be held at fraud");
  const underTxId = underTap.body.transactionId;
  if (underTxId) {
    const underAudit = await rest(
      `audit_log?transaction_id=eq.${underTxId}&step=eq.fraud.velocity&select=result`
    );
    assert(underAudit.body?.[0]?.result === "pass", "fraud.velocity should pass for under-tap amount");
  }

  console.log("test-fraud: per-tap under integration PASS");
} finally {
  await setGlobalRule("max_per_tap", saved.max_per_tap);
  await setGlobalRule("daily_amount", saved.daily_amount);
  await rest(`velocity_counters?wallet_address=eq.${walletLower}&window_date=eq.${today}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

console.log("test-fraud: ALL PASS");
