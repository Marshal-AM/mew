/**
 * POST a synthetic 16 kHz mono WAV to voice-query and verify Deepgram TTS response.
 *
 * Usage:
 *   VOICE_QUERY_URL=https://....supabase.co/functions/v1/voice-query \
 *   SUPABASE_ANON_KEY=... node scripts/test-voice-query.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function buildWavPcm16(samples) {
  const numChannels = 1;
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

const fnSrc = readFileSync(
  join(__dirname, "..", "supabase/functions/voice-query/index.ts"),
  "utf8",
);
const geminiClient = readFileSync(
  join(__dirname, "..", "supabase/functions/_shared/voice-agent/gemini_client.ts"),
  "utf8",
);
assert(fnSrc.includes("parseWav"), "voice-query must parse WAV");
assert(fnSrc.includes("pcmBase64"), "voice-query must return pcmBase64");
assert(fnSrc.includes("runVoiceAgent"), "voice-query must run Gemini agent");
assert(
  geminiClient.includes("gemini-3.1-flash-lite-preview"),
  "must use fast understand model",
);
assert(fnSrc.includes("replyText"), "voice-query must return replyText");
assert(fnSrc.includes("16000"), "voice-query must expect 16 kHz input");
console.log("test-voice-query: static checks PASS");

const url = process.env.VOICE_QUERY_URL?.trim();
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const posId = process.env.POS_ID?.trim() || "POS-001";

if (!url || !anonKey) {
  console.log("test-voice-query: skip live HTTP (set VOICE_QUERY_URL + SUPABASE_ANON_KEY)");
  process.exit(0);
}

const samples = new Int16Array(1600);
for (let i = 0; i < samples.length; i++) {
  samples[i] = Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 16000));
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
console.log("HTTP", res.status, text.slice(0, 200));

if (res.status === 503 && text.includes("GOOGLE_API_KEY")) {
  console.log("test-voice-query: skip live (GOOGLE_API_KEY not set on Supabase)");
  process.exit(0);
}

if (res.status === 400 && text.includes("429")) {
  console.log("test-voice-query: skip live (Gemini quota exceeded — check API key/billing)");
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
assert(!replyPcm.equals(wav.subarray(44)), "reply must not be byte-identical echo");

console.log("test-voice-query: live HTTP PASS");
