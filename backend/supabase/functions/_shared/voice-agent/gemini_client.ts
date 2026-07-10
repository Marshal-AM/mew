const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_FETCH_TIMEOUT_MS = 90_000;

function getGeminiFetchTimeoutMs(): number {
  const raw = Deno.env.get("GEMINI_FETCH_TIMEOUT_MS")?.trim();
  if (!raw) return DEFAULT_GEMINI_FETCH_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GEMINI_FETCH_TIMEOUT_MS;
}

/** Match agentest/services/gemini_audio.py defaults */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_TOOL_MODEL = "gemini-3.5-flash";
export const DEFAULT_EMBED_MODEL = "text-embedding-004";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const id = m.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Primary audio understanding model(s) — agentest default first. */
export function getAudioModelChain(): string[] {
  const primary = Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_GEMINI_MODEL;
  const extras = (Deno.env.get("GEMINI_MODEL_FALLBACKS")?.trim() || "gemini-3.5-flash,gemini-2.5-flash-lite")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return uniqueModels([primary, ...extras]);
}

/** Text + tools model(s). */
export function getToolModelChain(): string[] {
  const primary = Deno.env.get("GEMINI_TOOL_MODEL")?.trim() || DEFAULT_TOOL_MODEL;
  const extras = (Deno.env.get("GEMINI_TOOL_MODEL_FALLBACKS")?.trim() || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return uniqueModels([primary, ...extras]);
}

export function getGeminiConfig(): GeminiConfig {
  const apiKey = Deno.env.get("GOOGLE_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }
  return { apiKey, model: getAudioModelChain()[0] };
}

export function getEmbedModel(): string {
  return Deno.env.get("GEMINI_EMBED_MODEL")?.trim() || DEFAULT_EMBED_MODEL;
}

function parseRetryDelayMs(message: string): number | null {
  const match = message.match(/retry in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]) * 1000) + 500;
}

export function isModelUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Gemini (404|500|503):/.test(msg);
}

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Gemini 429:/.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiHeaders(apiKey: string): Record<string, string> {
  // agentest google.genai SDK sends x-goog-api-key (not ?key= query param).
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
}

export async function geminiGenerateContent(
  model: string,
  body: Record<string, unknown>,
  opts?: { maxRateLimitRetries?: number; timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  const maxRateLimitRetries = opts?.maxRateLimitRetries ?? 2;
  const timeoutMs = opts?.timeoutMs ?? getGeminiFetchTimeoutMs();
  const url = `${GEMINI_BASE}/models/${model}:generateContent`;

  let lastError = "Gemini request failed";

  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: geminiHeaders(apiKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await res.text();
      if (res.ok) {
        return JSON.parse(text) as Record<string, unknown>;
      }

      lastError = `Gemini ${res.status}: ${text.slice(0, 500)}`;

      if (res.status === 429 && attempt < maxRateLimitRetries) {
        const delay = parseRetryDelayMs(text) ?? 4000;
        console.warn(`[gemini] ${model} rate limited, retry in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      throw new Error(lastError);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Gemini request timed out after ${timeoutMs}ms (${model})`);
      }
      throw err;
    }
  }

  throw new Error(lastError);
}

export async function geminiGenerateWithModelFallback(
  models: string[],
  body: Record<string, unknown>,
): Promise<{ json: Record<string, unknown>; model: string }> {
  const chain = uniqueModels(models);
  let lastError = "Gemini request failed";

  for (const model of chain) {
    try {
      const json = await geminiGenerateContent(model, body);
      if (model !== chain[0]) {
        console.log(`[gemini] succeeded with fallback model ${model}`);
      }
      return { json, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (!isModelUnavailableError(err)) {
        throw err;
      }
      console.warn(`[gemini] ${model} unavailable, trying next model`);
    }
  }

  throw new Error(lastError);
}

export async function geminiEmbedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  const model = getEmbedModel();
  const url = `${GEMINI_BASE}/models/${model}:embedContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: geminiHeaders(apiKey),
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
    signal: AbortSignal.timeout(getGeminiFetchTimeoutMs()),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini embed ${res.status}: ${raw.slice(0, 300)}`);
  }

  const json = JSON.parse(raw) as {
    embedding?: { values?: number[] };
  };
  const values = json.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini embed returned no values");
  }
  return values.length > 768 ? values.slice(0, 768) : values;
}

export function extractTextFromResponse(json: Record<string, unknown>): string {
  const candidates = json.candidates as Array<{
    content?: { parts?: Array<{ text?: string }> };
  }> | undefined;

  const parts = candidates?.[0]?.content?.parts ?? [];
  let text = "";
  for (const part of parts) {
    if (part.text) {
      text += part.text;
    }
  }
  return text.trim();
}

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export function extractModelParts(json: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = json.candidates as Array<{
    content?: { parts?: Record<string, unknown>[] };
  }> | undefined;
  return [...(candidates?.[0]?.content?.parts ?? [])];
}

export function extractFunctionCalls(json: Record<string, unknown>): FunctionCall[] {
  const candidates = json.candidates as Array<{
    content?: {
      parts?: Array<{
        functionCall?: { name?: string; args?: Record<string, unknown> };
      }>;
    };
  }> | undefined;

  const calls: FunctionCall[] = [];
  for (const part of candidates?.[0]?.content?.parts ?? []) {
    const fc = part.functionCall;
    if (fc?.name) {
      calls.push({ name: fc.name, args: fc.args ?? {} });
    }
  }
  return calls;
}
