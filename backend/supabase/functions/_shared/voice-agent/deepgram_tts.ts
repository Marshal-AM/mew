import { bytesToInt16Pcm, pcm16ToBase64, trimPcm16Silence } from "./audio.ts";

const DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak";
const POS_SAMPLE_RATE = 16_000;
const DEFAULT_DEEPGRAM_MODEL = "aura-2-thalia-en";
const DEEPGRAM_FETCH_TIMEOUT_MS = 60_000;

export interface TtsResult {
  pcm16: Int16Array;
  samples: number;
  durationMs: number;
  sampleRate: number;
  pcmBase64: string;
  model: string;
}

function getDeepgramApiKey(): string {
  const apiKey = Deno.env.get("DEEPGRAM_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }
  return apiKey;
}

function getDeepgramModel(): string {
  return Deno.env.get("DEEPGRAM_TTS_MODEL")?.trim() || DEFAULT_DEEPGRAM_MODEL;
}

/** Synthesize speech with Deepgram Aura; return 16 kHz mono PCM for POS playback. */
export async function textToPosPcm(text: string): Promise<TtsResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty text for TTS");
  }

  const apiKey = getDeepgramApiKey();
  const model = getDeepgramModel();
  const url = new URL(DEEPGRAM_SPEAK_URL);
  url.searchParams.set("model", model);
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", String(POS_SAMPLE_RATE));
  url.searchParams.set("container", "none");

  console.log(`[tts] provider=deepgram model=${model} text_chars=${trimmed.length}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: trimmed }),
    signal: AbortSignal.timeout(DEEPGRAM_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Deepgram TTS ${res.status}: ${body.slice(0, 300)}`);
  }

  const raw = new Uint8Array(await res.arrayBuffer());
  if (raw.length === 0) {
    throw new Error("Deepgram TTS returned empty audio");
  }

  const pcm16 = trimPcm16Silence(bytesToInt16Pcm(raw), 350, 320);
  const durationMs = Math.round((pcm16.length / POS_SAMPLE_RATE) * 1000);

  return {
    pcm16,
    samples: pcm16.length,
    durationMs,
    sampleRate: POS_SAMPLE_RATE,
    pcmBase64: pcm16ToBase64(pcm16),
    model: `deepgram:${model}`,
  };
}
