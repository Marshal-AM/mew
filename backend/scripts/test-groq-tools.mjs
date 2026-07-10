/**
 * Verify Groq openai/gpt-oss-120b tool calling (OpenAI-compatible format).
 *
 * Usage: node scripts/test-groq-tools.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROQ_BASE = "https://api.groq.com/openai/v1";
const LLM_MODEL = "openai/gpt-oss-120b";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function loadEnv() {
  for (const rel of ["../agentest/.env", "../.env"]) {
    const p = join(__dirname, "..", rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_revenue",
      description: "Total confirmed revenue for this merchant over the last N days.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", description: "Lookback days (default 7)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_products",
      description: "Top selling products by transaction count.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer" },
          limit: { type: "integer" },
        },
      },
    },
  },
];

async function groqChat(apiKey, messages, tools) {
  const body = {
    model: LLM_MODEL,
    messages,
    temperature: 0.4,
    reasoning_effort: "low",
    tools,
    tool_choice: "auto",
  };

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) fail(`Groq ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

loadEnv();
const apiKey = process.env.GROQ_API_KEY?.trim();
if (!apiKey) fail("GROQ_API_KEY missing");

console.log("test-groq-tools: model =", LLM_MODEL);

// Round 1 — should request a tool for revenue question
const r1 = await groqChat(apiKey, [
  {
    role: "system",
    content:
      "You are a POS voice assistant. For revenue or sales questions you MUST call get_revenue. Reply with plain spoken text only after tools return.",
  },
  { role: "user", content: "What was my revenue over the last 7 days?" },
], TOOLS);

const msg1 = r1.choices?.[0]?.message;
const toolCalls = msg1?.tool_calls ?? [];
if (toolCalls.length === 0) {
  console.log("response:", JSON.stringify(msg1, null, 2));
  fail("expected tool_calls on revenue question");
}

const call = toolCalls[0];
console.log("  tool call:", call.function?.name, call.function?.arguments);

if (call.function?.name !== "get_revenue") {
  fail(`expected get_revenue, got ${call.function?.name}`);
}

// Round 2 — feed mock tool result, expect spoken answer
const r2 = await groqChat(apiKey, [
  {
    role: "system",
    content:
      "You are a POS voice assistant. Reply with one short spoken sentence using tool results.",
  },
  { role: "user", content: "What was my revenue over the last 7 days?" },
  msg1,
  {
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify({ result: { revenue_cents: 125000, days: 7, currency: "USD" } }),
  },
], TOOLS);

const msg2 = r2.choices?.[0]?.message;
const answer = (msg2?.content ?? "").trim();
if (!answer) {
  console.log("round2:", JSON.stringify(msg2, null, 2));
  fail("expected text answer after tool result");
}

console.log("  final answer:", answer);
console.log("test-groq-tools: PASS — openai/gpt-oss-120b tool calling works");
