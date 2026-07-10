/**
 * Phase 18–19 voice agent tests (static + optional live Gemini).
 *
 * Usage:
 *   node scripts/test-voice-agent.mjs
 *   VOICE_QUERY_URL=... SUPABASE_ANON_KEY=... node scripts/test-voice-agent.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function buildWavPcm16(samples) {
  const sampleRate = 16000;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

// --- Static checks ---
const voiceQuery = readFileSync(join(root, "supabase/functions/voice-query/index.ts"), "utf8");
const agentLoop = readFileSync(join(root, "supabase/functions/_shared/voice-agent/agent_loop.ts"), "utf8");
const geminiClient = readFileSync(join(root, "supabase/functions/_shared/voice-agent/gemini_client.ts"), "utf8");
const tools = readFileSync(join(root, "supabase/functions/_shared/voice-agent/tools.ts"), "utf8");
const deepgramTts = readFileSync(join(root, "supabase/functions/_shared/voice-agent/deepgram_tts.ts"), "utf8");
const tts = readFileSync(join(root, "supabase/functions/_shared/voice-agent/tts.ts"), "utf8");
const migration = readFileSync(
  join(root, "supabase/migrations/20250710180000_phase18_voice_agent.sql"),
  "utf8",
);

assert(voiceQuery.includes("runVoiceAgent"), "voice-query must call runVoiceAgent");
assert(voiceQuery.includes("replyText"), "voice-query must return replyText");
assert(voiceQuery.includes("GROQ_API_KEY"), "voice-query must require GROQ_API_KEY");
assert(agentLoop.includes("groqTranscribeWav") || agentLoop.includes("groq_client"), "agent must use Groq STT");
assert(agentLoop.includes("openai/gpt-oss-120b") || agentLoop.includes("getGroqLlmModel"), "agent must use GPT-OSS LLM");
assert(tts.includes("deepgram_tts"), "TTS must use Deepgram");
assert(deepgramTts.includes("api.deepgram.com/v1/speak"), "Deepgram speak API must be used");
assert(deepgramTts.includes("linear16"), "Deepgram must request linear16 PCM");
assert(deepgramTts.includes("POS_SAMPLE_RATE") && deepgramTts.includes("16_000"), "Deepgram must request 16 kHz for POS playback");
assert(tools.includes("get_revenue"), "tools must include get_revenue");
assert(tools.includes("get_account_status"), "tools must include get_account_status");
assert(tools.includes("search_products"), "tools must include search_products");
assert(migration.includes("agent_match_products"), "migration must define agent_match_products");
assert(migration.includes("embedding_jobs"), "migration must define embedding_jobs");

console.log("test-voice-agent: static checks PASS");

// Tool schemas must not accept merchant_id from the model
const declStart = tools.indexOf("export const TOOL_DECLARATIONS = [");
const declEnd = tools.indexOf("];", declStart);
const declOnly = tools.slice(declStart, declEnd);
assert(!declOnly.includes("merchant_id"), "tool declarations must not expose merchant_id");

const url = process.env.VOICE_QUERY_URL?.trim();
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const posId = process.env.POS_ID?.trim() || "POS-001";

if (!url || !anonKey) {
  console.log("test-voice-agent: skip live HTTP (set VOICE_QUERY_URL + SUPABASE_ANON_KEY)");
  process.exit(0);
}

const samples = new Int16Array(8000);
for (let i = 0; i < samples.length; i++) {
  samples[i] = Math.round(4000 * Math.sin((2 * Math.PI * 220 * i) / 16000));
}
const wav = buildWavPcm16(samples);

const boundary = "----MooVoiceBoundary7MA4YWxk";
const parts = [
  `--${boundary}\r\n`,
  `Content-Disposition: form-data; name="pos_id"\r\n\r\n`,
  `${posId}\r\n`,
  `--${boundary}\r\n`,
  `Content-Disposition: form-data; name="audio"; filename="test.wav"\r\n`,
  `Content-Type: audio/wav\r\n\r\n`,
].join("");
const tail = `\r\n--${boundary}--\r\n`;
const body = Buffer.concat([Buffer.from(parts, "utf8"), wav, Buffer.from(tail, "utf8")]);

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
console.log("HTTP", res.status, text.slice(0, 300));

if (res.status === 503 && text.includes("GOOGLE_API_KEY")) {
  console.log("test-voice-agent: skip live (GOOGLE_API_KEY not set on Supabase)");
  process.exit(0);
}

if (res.status === 400 && text.includes("429")) {
  console.log("test-voice-agent: skip live (Gemini quota exceeded — check API key/billing)");
  process.exit(0);
}

if (res.status === 400 && text.includes("503")) {
  console.log("test-voice-agent: skip live (Gemini model temporarily unavailable)");
  process.exit(0);
}

assert(res.ok, `expected 2xx, got ${res.status}: ${text}`);

const json = JSON.parse(text);
assert(json.ok === true, "ok must be true");
assert(typeof json.replyText === "string" && json.replyText.length > 0, "replyText missing");
assert(typeof json.pcmBase64 === "string" && json.pcmBase64.length > 100, "pcmBase64 missing");
assert(json.sampleRate === 16000, "sampleRate must be 16000");

const replyPcm = Buffer.from(json.pcmBase64, "base64");
assert(replyPcm.length >= 2, "reply PCM too short");
assert(replyPcm.length % 2 === 0, "reply PCM must be 16-bit aligned");
assert(!replyPcm.equals(wav.subarray(44)), "reply must not be identical echo of input");

console.log("test-voice-agent: live HTTP PASS");
console.log("  replyText:", json.replyText.slice(0, 120));
console.log("  tools:", (json.toolsCalled ?? []).join(", ") || "(none)");
console.log("  latencyMs:", json.latencyMs);
