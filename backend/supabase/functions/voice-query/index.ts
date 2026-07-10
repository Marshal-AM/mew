import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runVoiceAgent } from "../_shared/voice-agent/agent_loop.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, ngrok-skip-browser-warning",
};

const EXPECTED_SAMPLE_RATE = 16000;
const EXPECTED_BITS = 16;
const EXPECTED_CHANNELS = 1;

interface WavInfo {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  dataOffset: number;
  dataSize: number;
  samples: number;
}

function readAscii(buf: Uint8Array, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(buf[offset + i] ?? 0);
  }
  return s;
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  ) >>> 0;
}

function readU16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function parseWav(bytes: Uint8Array): WavInfo {
  if (bytes.length < 44) {
    throw new Error("WAV too short");
  }
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }

  let offset = 12;
  let fmtFound = false;
  let dataOffset = -1;
  let dataSize = 0;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = readU32LE(bytes, offset + 4);
    const chunkData = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = readU16LE(bytes, chunkData);
      channels = readU16LE(bytes, chunkData + 2);
      sampleRate = readU32LE(bytes, chunkData + 4);
      bitsPerSample = readU16LE(bytes, chunkData + 14);
      fmtFound = true;
    } else if (chunkId === "data") {
      dataOffset = chunkData;
      dataSize = chunkSize;
      break;
    }

    offset = chunkData + chunkSize + (chunkSize % 2);
  }

  if (!fmtFound || dataOffset < 0 || dataSize === 0) {
    throw new Error("Invalid WAV: missing fmt or data chunk");
  }
  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV format ${audioFormat} (expected PCM=1)`);
  }
  if (sampleRate !== EXPECTED_SAMPLE_RATE) {
    throw new Error(`Expected ${EXPECTED_SAMPLE_RATE} Hz, got ${sampleRate}`);
  }
  if (bitsPerSample !== EXPECTED_BITS) {
    throw new Error(`Expected ${EXPECTED_BITS}-bit, got ${bitsPerSample}`);
  }
  if (channels !== EXPECTED_CHANNELS) {
    throw new Error(`Expected mono, got ${channels} channels`);
  }
  if (dataOffset + dataSize > bytes.length) {
    throw new Error("WAV data chunk extends past file end");
  }

  const bytesPerSample = (bitsPerSample / 8) * channels;
  const samples = Math.floor(dataSize / bytesPerSample);

  return {
    sampleRate,
    bitsPerSample,
    channels,
    dataOffset,
    dataSize,
    samples,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Deno.env.get("GROQ_API_KEY")?.trim()) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Deno.env.get("DEEPGRAM_API_KEY")?.trim()) {
      return new Response(JSON.stringify({ error: "DEEPGRAM_API_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const audioEntry = form.get("audio");
    const posId = (form.get("pos_id")?.toString() ?? "").trim();

    if (!posId) {
      return new Response(JSON.stringify({ error: "pos_id field required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(audioEntry instanceof File)) {
      return new Response(JSON.stringify({ error: "audio file required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: pos, error: posErr } = await admin
      .from("pos_devices")
      .select("merchant_id, payout_address, active, merchants(name)")
      .eq("pos_id", posId)
      .maybeSingle();

    if (posErr) {
      throw posErr;
    }
    if (!pos || !pos.active) {
      return new Response(JSON.stringify({ error: "POS device not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const merchantRow = pos.merchants as { name?: string } | null;
    const merchantCtx = {
      merchant_id: pos.merchant_id as string,
      merchant_name: merchantRow?.name ?? "Merchant",
      payout_address: pos.payout_address as string,
      pos_id: posId,
    };

    const wavBytes = new Uint8Array(await audioEntry.arrayBuffer());
    const info = parseWav(wavBytes);
    const inputDurationMs = Math.round((info.samples / info.sampleRate) * 1000);

    console.log(
      `[voice-query] pos=${posId} bytes=${wavBytes.length} samples=${info.samples} durationMs=${inputDurationMs}`,
    );

    const storagePath = `${posId}/${Date.now()}.wav`;
    const { error: storageErr } = await admin.storage
      .from("voice-clips")
      .upload(storagePath, wavBytes, { contentType: "audio/wav", upsert: false });

    if (storageErr) {
      console.warn("[voice-query] storage upload skipped:", storageErr.message);
    }

    const pcmBytes = wavBytes.subarray(info.dataOffset, info.dataOffset + info.dataSize);
    if (pcmBytes.byteLength < 3200) {
      return new Response(
        JSON.stringify({ error: "Recording too short — hold A and speak again" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const agent = await runVoiceAgent(admin, merchantCtx, {
      pcmBytes,
      sampleRate: info.sampleRate,
    });

    const { error: insertErr } = await admin.from("voice_queries").insert({
      pos_id: posId,
      merchant_id: pos.merchant_id,
      samples: info.samples,
      duration_ms: inputDurationMs,
      byte_size: wavBytes.length,
      storage_path: storageErr ? null : storagePath,
      reply_text: agent.replyText,
      tools_called: agent.toolsCalled,
      latency_ms: agent.latencyMs,
      model: agent.model,
    });

    if (insertErr) {
      console.warn("[voice-query] voice_queries insert:", insertErr.message);
    }

    console.log(
      `[voice-query] reply ${agent.replyText.slice(0, 80)} tools=${agent.toolsCalled.join(",")} latency=${agent.latencyMs}ms`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        posId,
        samples: agent.samples,
        durationMs: agent.durationMs,
        sampleRate: agent.sampleRate,
        replyText: agent.replyText,
        toolsCalled: agent.toolsCalled,
        latencyMs: agent.latencyMs,
        pcmBase64: agent.pcmBase64,
        ttsError: agent.ttsError ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice-query] error:", message);
    const retryable = /Gemini (404|429|500|503):|timed out after|All agent models failed|rate limited/.test(message);
    return new Response(JSON.stringify({ error: message }), {
      status: retryable ? 503 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
