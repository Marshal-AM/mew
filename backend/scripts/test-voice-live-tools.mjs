/**
 * Live voice-query test for merchant/tool questions — checks JSON stays POS-safe.
 *
 * Usage: node scripts/test-voice-live-tools.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const samplesDir = join(__dirname, "samples");
const revenueWav = join(samplesDir, "pos_voice_revenue_query.wav");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function loadEnv() {
  for (const rel of ["../.env", "../agentest/.env"]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

async function ensureRevenueWav() {
  if (existsSync(revenueWav)) return revenueWav;

  const dgKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!dgKey) fail("DEEPGRAM_API_KEY missing for sample synthesis");

  const phrase = "What was my revenue over the last seven days?";
  const url = new URL("https://api.deepgram.com/v1/speak");
  url.searchParams.set("model", "aura-2-thalia-en");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("container", "wav");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${dgKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: phrase }),
  });
  if (!res.ok) fail(`Deepgram sample TTS ${res.status}`);

  const { mkdirSync } = await import("node:fs");
  mkdirSync(samplesDir, { recursive: true });
  writeFileSync(revenueWav, Buffer.from(await res.arrayBuffer()));
  console.log("Created", revenueWav);
  return revenueWav;
}

loadEnv();
const inputWav = await ensureRevenueWav();
const wavBytes = readFileSync(inputWav);

const url =
  process.env.VOICE_QUERY_URL?.trim() ||
  `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/functions/v1/voice-query`;
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const posId = process.env.POS_ID?.trim() || "POS-001";

if (!url || !anonKey) fail("set SUPABASE_URL + SUPABASE_ANON_KEY");

const boundary = "----MooVoiceBoundary7MA4YWxk";
const parts = Buffer.from(
  [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="pos_id"\r\n\r\n`,
    `${posId}\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="audio"; filename="revenue.wav"\r\n`,
    `Content-Type: audio/wav\r\n\r\n`,
  ].join(""),
);
const body = Buffer.concat([parts, wavBytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);

console.log("test-voice-live-tools: POST", url);
const res = await fetch(url, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "ngrok-skip-browser-warning": "1",
  },
  body,
});

const text = await res.text();
console.log("HTTP", res.status, "body", text.length, "bytes");
if (!res.ok) fail(text.slice(0, 400));

const json = JSON.parse(text);
if (!json.ok) fail("ok:false");

const b64Len = json.pcmBase64?.length ?? 0;
const pcmBytes = b64Len ? Buffer.from(json.pcmBase64, "base64").length : 0;
console.log("  replyText:", json.replyText);
console.log("  tools:", (json.toolsCalled ?? []).join(", ") || "(none)");
console.log("  pcmBase64 chars:", b64Len, "pcm bytes:", pcmBytes);
console.log("  latencyMs:", json.latencyMs);

const MAX_JSON = 180_000;
if (b64Len > 0 && text.length > MAX_JSON) {
  fail(`JSON too large for POS (${text.length} > ${MAX_JSON})`);
}

if ((json.toolsCalled ?? []).length === 0) {
  console.log("WARN: no tools called — STT may not have matched revenue question");
}

console.log("test-voice-live-tools: PASS");
