/**
 * Local Groq STT + Groq LLM + Deepgram TTS pipeline test (no Supabase deploy).
 *
 * Usage:
 *   node scripts/test-voice-groq-pipeline.mjs
 *   node scripts/test-voice-groq-pipeline.mjs --wav scripts/samples/pos_voice_query_sample.wav
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const defaultWav = join(__dirname, "samples", "pos_voice_query_sample.wav");
const replyWav = join(__dirname, "samples", "pos_voice_groq_reply.wav");

const GROQ_BASE = "https://api.groq.com/openai/v1";
const DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function loadEnv() {
  for (const rel of ["../agentest/.env", "../.env"]) {
    const envPath = join(root, rel);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
      }
    }
  }
}

function parseWav(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
    fail("not a WAV file");
  }
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  let sampleRate = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (id === "fmt ") {
      sampleRate = buf.readUInt32LE(data + 4);
    } else if (id === "data") {
      dataOffset = data;
      dataSize = size;
      break;
    }
    offset = data + size + (size % 2);
  }
  if (dataOffset < 0) fail("WAV missing data chunk");
  return { pcm: buf.subarray(dataOffset, dataOffset + dataSize), sampleRate };
}

function pcm16ToWav(pcm, sampleRate = 16000) {
  const buf = Buffer.alloc(44 + pcm.length);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + pcm.length, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(pcm.length, 40);
  pcm.copy(buf, 44);
  return buf;
}

async function groqTranscribe(wavBuf, apiKey, model) {
  const form = new FormData();
  form.append("file", new Blob([wavBuf], { type: "audio/wav" }), "sample.wav");
  form.append("model", model);
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("temperature", "0");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) fail(`Groq STT ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (!json.text?.trim()) fail("Groq STT empty transcript");
  return json.text.trim();
}

async function groqChat(apiKey, model, messages) {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      reasoning_effort: "low",
    }),
  });
  const text = await res.text();
  if (!res.ok) fail(`Groq chat ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) fail("Groq chat empty reply");
  return reply;
}

async function deepgramTts(apiKey, text, model) {
  const url = new URL(DEEPGRAM_SPEAK_URL);
  url.searchParams.set("model", model);
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("container", "none");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    fail(`Deepgram TTS ${res.status}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

loadEnv();

const wavPath = process.argv.find((a) => a.endsWith(".wav")) ?? defaultWav;
if (!existsSync(wavPath)) fail(`missing ${wavPath}`);

const groqKey = process.env.GROQ_API_KEY?.trim();
const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
const sttModel = process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";
const llmModel = process.env.GROQ_VOICE_MODEL?.trim() ||
  (process.env.GROQ_MODEL?.trim()?.includes("gpt-oss") ? process.env.GROQ_MODEL.trim() : "openai/gpt-oss-120b");
const ttsModel = process.env.DEEPGRAM_TTS_MODEL?.trim() || "aura-2-thalia-en";

if (!groqKey) fail("GROQ_API_KEY missing (set in agentest/.env)");
if (!deepgramKey) fail("DEEPGRAM_API_KEY missing (set in agentest/.env)");

const wavBuf = readFileSync(wavPath);
const { pcm, sampleRate } = parseWav(wavBuf);
const uploadWav = pcm16ToWav(pcm, sampleRate);

console.log("test-voice-groq-pipeline:");
console.log("  input:", wavPath, `(${wavBuf.length} bytes, ${sampleRate} Hz)`);
console.log("  stt:", sttModel);
console.log("  llm:", llmModel);
console.log("  tts:", ttsModel);

const started = Date.now();

const transcript = await groqTranscribe(uploadWav, groqKey, sttModel);
console.log("  transcript:", transcript);

const replyText = await groqChat(groqKey, llmModel, [
  {
    role: "system",
    content:
      "You are a helpful voice assistant on a POS terminal. Answer briefly in one to three spoken sentences.",
  },
  { role: "user", content: `Merchant question: ${transcript}` },
]);
console.log("  replyText:", replyText);

const pcmReply = await deepgramTts(deepgramKey, replyText, ttsModel);
const replyWavBuf = pcm16ToWav(pcmReply, 16000);
writeFileSync(replyWav, replyWavBuf);

console.log("test-voice-groq-pipeline: PASS");
console.log("  latencyMs:", Date.now() - started);
console.log("  reply audio:", replyWav, `(${replyWavBuf.length} bytes)`);
