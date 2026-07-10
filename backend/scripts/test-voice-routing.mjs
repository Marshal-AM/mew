/** Echo detection — LLM must not answer "bestsellers" without tools. */

function normalizeSpeech(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isUselessTextWithoutTools(answer, question) {
  const a = normalizeSpeech(answer);
  const q = normalizeSpeech(question);
  if (!a) return true;
  const echoPhrases = [
    "best sellers",
    "bestsellers",
    "best seller",
    "top selling",
    "top products",
  ];
  if (echoPhrases.includes(a)) return true;
  if (a.length <= 24 && (q.includes(a) || a.includes(q))) return true;
  return false;
}

const q = "What are my best sellers?";
if (!isUselessTextWithoutTools("bestsellers", q)) {
  console.error("FAIL: should reject bestsellers echo");
  process.exit(1);
}
if (isUselessTextWithoutTools("Coffee Sandwich Water", q)) {
  console.error("FAIL: should accept real product names");
  process.exit(1);
}
if (isUselessTextWithoutTools("Paris", "What is the capital of France?")) {
  console.error("FAIL: should accept Paris");
  process.exit(1);
}

console.log("echo-guard: PASS");
