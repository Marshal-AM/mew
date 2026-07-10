import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AGENT_INSTRUCTION, VOICE_SUMMARY_INSTRUCTION } from "./prompt.ts";
import { buildWavFromPcm, capPcm16Duration, pcm16ToBase64, pcmDurationMs, shortenForVoice } from "./audio.ts";
import {
  extractGroqText,
  extractGroqToolCalls,
  getGroqLlmModel,
  getGroqSttModel,
  groqChat,
  groqTranscribeWav,
  VOICE_LLM_MAX_TOKENS,
  VOICE_LLM_TEMPERATURE,
  VOICE_TOOL_ROUND_MAX_TOKENS,
  type GroqChatMessage,
  type GroqToolDef,
} from "./groq_client.ts";
import { textToPosPcm } from "./tts.ts";
import {
  executeTool,
  type MerchantContext,
  TOOL_DECLARATIONS,
} from "./tools.ts";
import { formatToolResultsForVoice } from "./voice_format.ts";

const MAX_TOOL_ROUNDS = 6;
const MIN_PCM_BYTES = 3200;
const MAX_TEXT_ONLY_RETRIES = 3;

export interface VoiceAudioInput {
  pcmBytes: Uint8Array;
  sampleRate: number;
}

export interface VoiceAgentResult {
  replyText: string;
  pcmBase64: string;
  samples: number;
  durationMs: number;
  sampleRate: number;
  toolsCalled: string[];
  model: string;
  latencyMs: number;
  ttsError?: string;
}

const GROQ_TOOLS: GroqToolDef[] = TOOL_DECLARATIONS.map((decl) => ({
  type: "function" as const,
  function: {
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters,
  },
}));

function isInaudibleTranscript(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 3) {
    return true;
  }
  return /\b(no audio|silent|unintelligible|could not hear|can't hear|cannot hear|inaudible)\b/.test(t);
}

function normalizeSpeech(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Catch LLM echoing the question ("bestsellers") instead of calling tools. */
function isUselessTextWithoutTools(answer: string, question: string): boolean {
  const a = normalizeSpeech(answer);
  const q = normalizeSpeech(question);
  if (!a) {
    return true;
  }

  const echoPhrases = [
    "best sellers",
    "bestsellers",
    "best seller",
    "top selling",
    "top products",
    "top sellers",
    "your revenue",
    "my revenue",
    "sales data",
  ];
  if (echoPhrases.includes(a)) {
    return true;
  }

  if (a.length <= 24 && (q.includes(a) || a.includes(q))) {
    return true;
  }

  return false;
}

async function transcribeAudio(
  audio: VoiceAudioInput,
): Promise<{ transcript: string; model: string }> {
  const wav = buildWavFromPcm(audio.pcmBytes, audio.sampleRate);
  const transcript = await groqTranscribeWav(wav);
  return { transcript, model: getGroqSttModel() };
}

interface ToolResultEntry {
  name: string;
  result: unknown;
}

async function summarizeToolResultsForVoice(
  question: string,
  toolResults: ToolResultEntry[],
): Promise<{ answerText: string; model: string }> {
  const formatted = formatToolResultsForVoice(question, toolResults);
  if (formatted) {
    console.log(`[voice-agent] formatted voice reply: ${formatted}`);
    return { answerText: formatted, model: "voice-format" };
  }

  const dataLines = toolResults
    .map((t) => `${t.name}: ${JSON.stringify(t.result)}`)
    .join("\n");

  const message = await groqChat([
    { role: "system", content: VOICE_SUMMARY_INSTRUCTION },
    {
      role: "user",
      content: `Question: ${question}\nTool data:\n${dataLines}\n\nSpoken reply (one word if possible):`,
    },
  ], {
    temperature: VOICE_LLM_TEMPERATURE,
    maxTokens: VOICE_LLM_MAX_TOKENS,
  });

  const answerText = extractGroqText(message);
  if (!answerText) {
    throw new Error("Groq returned empty voice summary");
  }
  return { answerText, model: getGroqLlmModel() };
}

/** LLM decides tool calls — no regex routing. */
async function answerQuestion(
  admin: SupabaseClient,
  ctx: MerchantContext,
  question: string,
): Promise<{ answerText: string; toolsCalled: string[]; model: string }> {
  const toolsCalled: string[] = [];
  const toolResults: ToolResultEntry[] = [];
  const messages: GroqChatMessage[] = [
    { role: "system", content: AGENT_INSTRUCTION },
    { role: "user", content: question },
  ];

  let textOnlyRetries = 0;
  let forceToolsNext = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const assistant = await groqChat(messages, {
      tools: GROQ_TOOLS,
      temperature: VOICE_LLM_TEMPERATURE,
      maxTokens: VOICE_TOOL_ROUND_MAX_TOKENS,
      toolChoice: forceToolsNext ? "required" : "auto",
    });
    forceToolsNext = false;

    const calls = extractGroqToolCalls(assistant);

    if (calls.length === 0) {
      if (toolResults.length > 0) {
        break;
      }

      const text = extractGroqText(assistant);
      if (text && !isUselessTextWithoutTools(text, question)) {
        console.log(`[voice-agent] general answer (no tools): ${text}`);
        return { answerText: text, toolsCalled, model: getGroqLlmModel() };
      }

      if (textOnlyRetries < MAX_TEXT_ONLY_RETRIES) {
        textOnlyRetries++;
        forceToolsNext = textOnlyRetries >= 2;
        messages.push(assistant);
        messages.push({
          role: "user",
          content: forceToolsNext
            ? "This is about the merchant's shop data. You MUST call get_top_products, get_revenue, or another tool now."
            : "Do not echo the question. Call the correct tool for this merchant's data, or give a one-word general-knowledge answer only if it is unrelated to shop sales.",
        });
        console.log(`[voice-agent] retry tool decision (${textOnlyRetries}/${MAX_TEXT_ONLY_RETRIES})`);
        continue;
      }

      if (text) {
        return { answerText: text, toolsCalled, model: getGroqLlmModel() };
      }
      throw new Error("Groq returned empty response");
    }

    messages.push(assistant);

    for (const call of calls) {
      toolsCalled.push(call.name);
      let result: unknown;
      try {
        result = await executeTool(admin, ctx, call.name, call.args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = { error: msg };
      }
      toolResults.push({ name: call.name, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ result }),
      });
    }
  }

  if (toolResults.length === 0) {
    throw new Error("Could not fetch merchant data — try again");
  }

  const summary = await summarizeToolResultsForVoice(question, toolResults);
  return { answerText: summary.answerText, toolsCalled, model: summary.model };
}

export async function runVoiceAgent(
  admin: SupabaseClient,
  ctx: MerchantContext,
  audio: VoiceAudioInput,
): Promise<VoiceAgentResult> {
  const started = Date.now();

  if (audio.pcmBytes.byteLength < MIN_PCM_BYTES) {
    throw new Error(
      `Recording too short (${pcmDurationMs(audio.pcmBytes.byteLength, audio.sampleRate)} ms) — hold A and speak again`,
    );
  }

  console.log(
    `[voice-agent] groq pipeline pcm=${audio.pcmBytes.byteLength} rate=${audio.sampleRate} durationMs=${pcmDurationMs(audio.pcmBytes.byteLength, audio.sampleRate)}`,
  );

  const { transcript, model: sttModel } = await transcribeAudio(audio);
  console.log(`[voice-agent] transcript via ${sttModel}: ${transcript.slice(0, 100)}`);

  if (isInaudibleTranscript(transcript)) {
    throw new Error("Could not understand the recording — speak louder and try again");
  }

  const result = await answerQuestion(admin, ctx, transcript);
  let replyText = result.answerText;
  const toolsCalled = result.toolsCalled;
  const modelTag = `${sttModel}+${result.model}`;

  console.log(`[voice-agent] tools: ${toolsCalled.join(",") || "(none)"} model=${result.model}`);

  if (replyText.length > 120) {
    replyText = replyText.slice(0, 117) + "...";
  }

  replyText = shortenForVoice(replyText);
  console.log(`[voice-agent] TTS input only (${replyText.length} chars): ${replyText}`);

  let pcmBase64 = "";
  let samples = 0;
  let durationMs = 0;
  let sampleRate = 16_000;
  let ttsModel = "none";
  let ttsError: string | undefined;

  try {
    const tts = await textToPosPcm(replyText);
    const capped = replyText.length <= 24
      ? tts.pcm16
      : capPcm16Duration(tts.pcm16);
    pcmBase64 = capped.length === tts.pcm16.length ? tts.pcmBase64 : pcm16ToBase64(capped);
    samples = capped.length;
    durationMs = Math.round((samples / tts.sampleRate) * 1000);
    sampleRate = tts.sampleRate;
    ttsModel = tts.model;
    if (capped.length < tts.pcm16.length) {
      console.log(`[voice-agent] capped TTS ${tts.pcm16.length} -> ${capped.length} samples`);
    }
  } catch (err) {
    ttsError = err instanceof Error ? err.message : String(err);
    console.warn(`[voice-agent] TTS failed, returning text only: ${ttsError.slice(0, 120)}`);
  }

  return {
    replyText,
    pcmBase64,
    samples,
    durationMs,
    sampleRate,
    toolsCalled,
    model: `${modelTag}+${ttsModel}`,
    latencyMs: Date.now() - started,
    ttsError,
  };
}
