import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet, verifyTypedData, getAddress } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// --- Static: pipeline step ordering ---
const runPipelineSrc = readFileSync(
  join(root, "supabase/functions/_shared/pipeline/runPipeline.ts"),
  "utf8"
);
const stepsSrc = readFileSync(join(root, "supabase/functions/_shared/pipeline/steps.ts"), "utf8");

const expectedSteps = [
  "signature.verify",
  "replay.check",
  "sanctions.screen",
  "fraud.velocity",
  "balance.check",
  "settlement.relay",
  "audit.finalize",
];

for (const step of expectedSteps) {
  assert(stepsSrc.includes(`"${step}"`), `missing step runner: ${step}`);
}

const stepsMatch = stepsSrc.match(/export const PIPELINE_STEPS[^=]*=\s*\[([\s\S]*?)\];/);
assert(stepsMatch, "PIPELINE_STEPS array not found in steps.ts");
for (const step of expectedSteps) {
  assert(stepsMatch[1].includes(`"${step}"`), `PIPELINE_STEPS missing ${step}`);
}
assert(runPipelineSrc.includes("for (const stepName of PIPELINE_STEPS)"), "runPipeline must iterate PIPELINE_STEPS");
assert(!runPipelineSrc.includes("skip"), "runPipeline must not contain skip logic");

console.log("test-pipeline: step ordering static check PASS");

// --- Local EIP-712 verify ---
const FORWARDER = "0x9F0BF4aE6BBfD51eDbff77eA0D17A7bec484bb97";
const CHAIN_ID = 80002;
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
const token = "0x26D215752f68bc2254186F9f6FF068b8C4BdFd37";
const message = {
  token,
  from: signer.address,
  to: "0x0000000000000000000000000000000000000002",
  value: 5_000_000n,
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
  nonce: "0x" + "ab".repeat(32),
};

const signature = await signer.signTypedData(domain, types, message);
const recovered = verifyTypedData(domain, types, message, signature);
assert(getAddress(recovered) === getAddress(signer.address), "valid signature should recover signer");

const wrongMessage = { ...message, value: message.value + 1n };
const wrongRecovered = verifyTypedData(domain, types, wrongMessage, signature);
assert(
  getAddress(wrongRecovered) !== getAddress(signer.address),
  "signature for different message should not recover to signer"
);

const now = Math.floor(Date.now() / 1000);
assert(now > Number(message.validAfter), "validAfter window test");
assert(now < Number(message.validBefore), "validBefore window test");

console.log("test-pipeline: local EIP-712 verify PASS");

// --- Live integration (optional) ---
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const submitUrl =
  process.env.SUBMIT_TRANSACTION_URL ??
  (url ? `${url.replace(/\/$/, "")}/functions/v1/submit-transaction` : null);

if (!submitUrl || !anon) {
  console.log("test-pipeline: integration SKIP (set SUPABASE_URL + SUPABASE_ANON_KEY)");
  process.exit(0);
}

async function postPayload(payload) {
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify(payload),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

const probe = await postPayload({ t: "not-sp" });
if (probe.status === 404) {
  console.log("test-pipeline: integration SKIP (submit-transaction not deployed)");
  process.exit(0);
}

assert(probe.status === 400, `malformed payload should return 400 (got ${probe.status})`);

const corruptSig = {
  t: "sp",
  value: message.value.toString(),
  signature: "0x" + "00".repeat(65),
  tokenAddress: token,
  posNonce: "a".repeat(32),
  from: signer.address,
  to: message.to,
  validAfter: "0",
  validBefore: message.validBefore.toString(),
  nonce: message.nonce,
  reqId: "abc123",
  posId: "POS-001",
};

const declined = await postPayload(corruptSig);
assert(
  declined.body.status === "declined" || declined.body.error,
  "corrupted signature should decline or error"
);

console.log("test-pipeline: integration adversarial PASS");
console.log("test-pipeline: ALL PASS");
