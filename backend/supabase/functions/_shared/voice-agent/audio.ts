/** Linear resample mono int16 PCM to target sample rate. */
export function resamplePcm16(
  pcm: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate || pcm.length === 0) {
    return pcm;
  }

  const outLen = Math.max(1, Math.floor((pcm.length * toRate) / fromRate));
  const out = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const srcPos = (i * fromRate) / toRate;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = pcm[idx] ?? 0;
    const s1 = pcm[Math.min(idx + 1, pcm.length - 1)] ?? s0;
    const v = Math.round(s0 + frac * (s1 - s0));
    out[i] = Math.max(-32768, Math.min(32767, v));
  }

  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return bytesToBase64(bytes);
}

/** Build a standard mono 16-bit PCM WAV container (same layout as ESP32 voiceBuildWavHeader). */
export function buildWavFromPcm(
  pcmBytes: Uint8Array,
  sampleRate: number,
): Uint8Array {
  const alignedLen = pcmBytes.byteLength - (pcmBytes.byteLength % 2);
  const pcm = pcmBytes.subarray(0, alignedLen);
  const wav = new Uint8Array(44 + pcm.length);
  const chunkSize = 36 + pcm.length;

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      wav[offset + i] = text.charCodeAt(i);
    }
  };
  const writeU32 = (offset: number, value: number) => {
    wav[offset] = value & 0xff;
    wav[offset + 1] = (value >> 8) & 0xff;
    wav[offset + 2] = (value >> 16) & 0xff;
    wav[offset + 3] = (value >> 24) & 0xff;
  };
  const writeU16 = (offset: number, value: number) => {
    wav[offset] = value & 0xff;
    wav[offset + 1] = (value >> 8) & 0xff;
  };

  writeAscii(0, "RIFF");
  writeU32(4, chunkSize);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  writeU32(16, 16);
  writeU16(20, 1);
  writeU16(22, 1);
  writeU32(24, sampleRate);
  writeU32(28, sampleRate * 2);
  writeU16(32, 2);
  writeU16(34, 16);
  writeAscii(36, "data");
  writeU32(40, pcm.length);
  wav.set(pcm, 44);

  return wav;
}

export function parsePcmSampleRate(mimeType: string | null | undefined): number {
  if (!mimeType) {
    return 24_000;
  }
  const match = mimeType.match(/rate=(\d+)/);
  return match ? parseInt(match[1], 10) : 24_000;
}

export function decodeInlineAudio(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  const trimmed = data.trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    const bin = atob(trimmed.replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  const out = new Uint8Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) {
    out[i] = trimmed.charCodeAt(i);
  }
  return out;
}

export function bytesToInt16Pcm(bytes: Uint8Array): Int16Array {
  const aligned = bytes.byteLength - (bytes.byteLength % 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, aligned);
  const out = new Int16Array(aligned / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, true);
  }
  return out;
}

export function trimPcm16Silence(
  pcm: Int16Array,
  threshold = 300,
  padSamples = 240,
): Int16Array {
  if (pcm.length === 0) {
    return pcm;
  }

  let start = 0;
  let end = pcm.length;
  for (; start < end; start++) {
    if (Math.abs(pcm[start]) > threshold) {
      break;
    }
  }
  for (; end > start; end--) {
    if (Math.abs(pcm[end - 1]) > threshold) {
      break;
    }
  }

  if (start >= end) {
    return pcm;
  }

  start = Math.max(0, start - padSamples);
  end = Math.min(pcm.length, end + padSamples);
  return pcm.slice(start, end);
}

export function pcmDurationMs(byteLength: number, sampleRate: number): number {
  const samples = Math.floor(byteLength / 2);
  return Math.round((samples / sampleRate) * 1000);
}

/** POS JSON over WiFi must stay small — long TTS breaks ESP32 base64 decode. */
export const MAX_VOICE_REPLY_CHARS = 48;
export const MAX_VOICE_PCM_SAMPLES = 40_000; // 2.5 s @ 16 kHz

export function shortenForVoice(text: string, maxChars = MAX_VOICE_REPLY_CHARS): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) {
    return t;
  }
  const cut = t.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (lastStop >= 40) {
    return cut.slice(0, lastStop + 1);
  }
  return cut.trimEnd() + "…";
}

export function capPcm16Duration(
  pcm: Int16Array,
  maxSamples = MAX_VOICE_PCM_SAMPLES,
): Int16Array {
  if (pcm.length <= maxSamples) {
    return pcm;
  }
  return pcm.slice(0, maxSamples);
}
