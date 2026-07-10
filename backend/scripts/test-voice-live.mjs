/**
 * Live end-to-end voice-query test using a real sample WAV.
 *
 * Generates sample if missing, POSTs to voice-query, saves TTS reply PCM.
 *
 * Usage:
 *   node scripts/test-voice-live.mjs
 *   node scripts/test-voice-live.mjs --wav scripts/samples/pos_voice_query_sample.wav
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const samplesDir = join(__dirname, "samples");
const defaultWav = join(samplesDir, "pos_voice_query_sample.wav");
const replyWav = join(samplesDir, "pos_voice_reply_sample.wav");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function loadEnv() {
  const envPath = join(root, "..", ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2];
      }
    }
  }
}

function ensureSampleWav(targetPath) {
  if (existsSync(targetPath)) {
    return targetPath;
  }

  mkdirSync(samplesDir, { recursive: true });
  const mp3 = join(root, "..", "agentest", "sample_input.mp3");
  const py = join(root, "..", "agentest", ".venv", "Scripts", "python.exe");

  if (!existsSync(mp3)) {
    fail(`missing ${mp3} — run agentest or place a 16 kHz mono WAV at ${targetPath}`);
  }
  if (!existsSync(py)) {
    fail(`missing agentest venv — place a 16 kHz mono WAV at ${targetPath}`);
  }

  console.log("Generating sample WAV from agentest/sample_input.mp3 …");
  const script = `
from pathlib import Path
from pydub import AudioSegment
import static_ffmpeg
static_ffmpeg.add_paths()
audio = AudioSegment.from_mp3(${JSON.stringify(mp3)})
audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
audio.export(${JSON.stringify(targetPath)}, format="wav")
print(len(audio))
`;
  const r = spawnSync(py, ["-c", script], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    fail("could not convert sample_input.mp3 to WAV");
  }
  console.log(`Created ${targetPath} (${r.stdout.trim()} ms audio)`);
  return targetPath;
}

function pcm16ToWav(pcm, sampleRate = 16000) {
  const dataSize = pcm.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
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
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, 44);
  return buf;
}

loadEnv();

const wavArg = process.argv.find((a) => a.endsWith(".wav"));
const inputWav = ensureSampleWav(wavArg ?? defaultWav);
const wavBytes = readFileSync(inputWav);

const url =
  process.env.VOICE_QUERY_URL?.trim() ||
  `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/functions/v1/voice-query`;
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const posId = process.env.POS_ID?.trim() || "POS-001";

if (!url || !anonKey) {
  fail("set SUPABASE_URL + SUPABASE_ANON_KEY in .env");
}

console.log("test-voice-live: input", inputWav, `(${wavBytes.length} bytes)`);
console.log("test-voice-live: POST", url);

const boundary = "----MooVoiceBoundary7MA4YWxk";
const parts = Buffer.from(
  [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="pos_id"\r\n\r\n`,
    `${posId}\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="audio"; filename="sample.wav"\r\n`,
    `Content-Type: audio/wav\r\n\r\n`,
  ].join(""),
);
const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([parts, wavBytes, tail]);

const started = Date.now();
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
const elapsed = Date.now() - started;

console.log("HTTP", res.status, `(${elapsed} ms client)`);
console.log(text.slice(0, 400));

if (!res.ok) {
  if (text.includes("GOOGLE_API_KEY")) {
    console.log("HINT: run npx supabase secrets set GOOGLE_API_KEY=... --project-ref pxqcsqnsgukmszuxxxbi");
  }
  fail(`voice-query returned ${res.status}`);
}

const json = JSON.parse(text);
if (!json.ok || !json.replyText) {
  fail("response missing ok/replyText");
}

if (json.ttsError) {
  console.log("test-voice-live: PASS (text only — TTS quota/error)");
  console.log("  ttsError:", json.ttsError.slice(0, 200));
} else if (!json.pcmBase64) {
  fail("response missing pcmBase64");
} else {
  const replyPcm = Buffer.from(json.pcmBase64, "base64");
  const replyWavBuf = pcm16ToWav(replyPcm, json.sampleRate ?? 16000);
  writeFileSync(replyWav, replyWavBuf);
  console.log("  reply audio:", replyWav, `(${replyWavBuf.length} bytes, ${json.samples} samples)`);
}

console.log("test-voice-live: PASS");
console.log("  replyText:", json.replyText);
console.log("  tools:", (json.toolsCalled ?? []).join(", ") || "(none)");
console.log("  server latencyMs:", json.latencyMs);
