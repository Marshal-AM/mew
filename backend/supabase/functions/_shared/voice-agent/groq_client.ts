const GROQ_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";
/** Groq model IDs: https://console.groq.com/docs/models — GPT-OSS supports tool calling */
export const GROQ_GPT_OSS_120B = "openai/gpt-oss-120b";
export const GROQ_GPT_OSS_20B = "openai/gpt-oss-20b";
const DEFAULT_LLM_MODEL = GROQ_GPT_OSS_120B;
const GROQ_FETCH_TIMEOUT_MS = 60_000;
export const VOICE_LLM_TEMPERATURE = 0.1;
export const VOICE_LLM_MAX_TOKENS = 150;
export const VOICE_TOOL_ROUND_MAX_TOKENS = 512;

export function getGroqApiKey(): string {
  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }
  return apiKey;
}

export function getGroqSttModel(): string {
  return Deno.env.get("GROQ_STT_MODEL")?.trim() || DEFAULT_STT_MODEL;
}

/** Voice agent LLM — GPT-OSS only (not Llama). */
export function getGroqLlmModel(): string {
  const configured = Deno.env.get("GROQ_MODEL")?.trim();
  if (configured && /gpt-oss/i.test(configured)) {
    return configured;
  }
  return DEFAULT_LLM_MODEL;
}

function isGptOssModel(model: string): boolean {
  return /gpt-oss/i.test(model);
}

export interface GroqToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GroqChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface GroqToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface GroqChatResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: GroqChatMessage;
  }>;
}

export async function groqTranscribeWav(wavBytes: Uint8Array): Promise<string> {
  const apiKey = getGroqApiKey();
  const model = getGroqSttModel();

  const form = new FormData();
  form.append("file", new Blob([wavBytes], { type: "audio/wav" }), "recording.wav");
  form.append("model", model);
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("temperature", "0");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(GROQ_FETCH_TIMEOUT_MS),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Groq STT ${res.status}: ${raw.slice(0, 400)}`);
  }

  const json = JSON.parse(raw) as { text?: string };
  const text = json.text?.trim() ?? "";
  if (!text) {
    throw new Error("Groq STT returned empty transcript");
  }
  return text;
}

export async function groqChat(
  messages: GroqChatMessage[],
  opts?: {
    tools?: GroqToolDef[];
    temperature?: number;
    maxTokens?: number;
    toolChoice?: "auto" | "required" | "none";
  },
): Promise<GroqChatMessage> {
  const apiKey = getGroqApiKey();
  const model = getGroqLlmModel();

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts?.temperature ?? VOICE_LLM_TEMPERATURE,
  };
  if (opts?.maxTokens != null) {
    body.max_tokens = opts.maxTokens;
  }
  if (isGptOssModel(model)) {
    body.reasoning_effort = "low";
  }
  if (opts?.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GROQ_FETCH_TIMEOUT_MS),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Groq chat ${res.status}: ${raw.slice(0, 400)}`);
  }

  const json = JSON.parse(raw) as GroqChatResponse;
  const message = json.choices?.[0]?.message;
  if (!message) {
    throw new Error("Groq chat returned no message");
  }
  return message;
}

export function extractGroqToolCalls(message: GroqChatMessage): GroqToolCall[] {
  const calls: GroqToolCall[] = [];
  for (const tc of message.tool_calls ?? []) {
    if (tc.type !== "function" || !tc.function?.name) {
      continue;
    }
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }
    calls.push({ id: tc.id, name: tc.function.name, args });
  }
  return calls;
}

export function extractGroqText(message: GroqChatMessage): string {
  return (message.content ?? "").trim();
}
