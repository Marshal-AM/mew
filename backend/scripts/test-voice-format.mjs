/** Inline checks mirroring voice_format.ts (Node cannot import .ts directly). */

function formatRevenueVoice(rev) {
  if (!Number.isFinite(rev)) return "0";
  if (rev === 0) return "0";
  if (Math.abs(rev) < 1) {
    return rev.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (Math.abs(rev) < 100) {
    return rev.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return String(Math.round(rev));
}

function firstWords(text, maxWords) {
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function formatTopProducts(question, products) {
  const q = question.toLowerCase();
  const names = products.map((p) => String(p.product_name ?? "").trim()).filter(Boolean);
  if (names.length === 0) return "None";
  const wantsOne = /\b(best|bestseller|top product|number one|#1)\b/.test(q);
  if (wantsOne || names.length === 1) return firstWords(names[0], 1);
  return names.slice(0, 3).map((n) => firstWords(n, 1)).join(" ");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  formatTopProducts("What are my top selling products?", [
    { product_name: "Coffee" },
    { product_name: "Sandwich" },
    { product_name: "Water" },
  ]) === "Coffee Sandwich Water",
  "top products lists real names",
);

assert(formatRevenueVoice(0.04) === "0.04", "small revenue keeps decimals");
assert(formatRevenueVoice(1250) === "1250", "large revenue rounds");

console.log("voice_format: PASS");
