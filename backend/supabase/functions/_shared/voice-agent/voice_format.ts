/** Deterministic spoken replies from tool JSON — avoids LLM inventing "A B and C". */

interface TopProductRow {
  product_name?: string;
}

interface NamedProduct {
  name?: string;
}

function firstWords(text: string, maxWords: number): string {
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function formatRevenueVoice(rev: number): string {
  if (!Number.isFinite(rev)) {
    return "0";
  }
  if (rev === 0) {
    return "0";
  }
  if (Math.abs(rev) < 1) {
    return rev.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (Math.abs(rev) < 100) {
    return rev.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return String(Math.round(rev));
}

export function formatToolResultsForVoice(
  question: string,
  toolResults: Array<{ name: string; result: unknown }>,
): string | null {
  if (toolResults.length === 0) {
    return null;
  }

  const q = question.toLowerCase();

  for (let i = toolResults.length - 1; i >= 0; i--) {
    const { name, result } = toolResults[i];
    const r = result as Record<string, unknown>;

    if (r.error) {
      return "Error";
    }

    switch (name) {
      case "get_top_products": {
        const products = (r.products as TopProductRow[] | undefined) ?? [];
        const names = products
          .map((p) => String(p.product_name ?? "").trim())
          .filter((n) => n.length > 0);
        if (names.length === 0) {
          return "None";
        }
        const wantsOne = /\b(best seller|bestseller|top product|number one|#1)\b/.test(q) &&
          !/\b(best sellers|top sellers|top selling products)\b/.test(q);
        if (wantsOne || names.length === 1) {
          return firstWords(names[0], 1);
        }
        return names.slice(0, 3).map((n) => firstWords(n, 1)).join(" ");
      }

      case "get_revenue": {
        return formatRevenueVoice(Number(r.revenue ?? 0));
      }

      case "get_transaction_count": {
        return String(Number(r.count ?? 0));
      }

      case "get_account_status": {
        if (r.payout_frozen || r.system_suspended) {
          return "Frozen";
        }
        if (Number(r.held_or_review_count ?? 0) > 0) {
          return "Held";
        }
        if (Number(r.pending_count ?? 0) > 0) {
          return "Pending";
        }
        return "Clear";
      }

      case "search_products": {
        const products = (r.products as NamedProduct[] | undefined) ?? [];
        const hit = products.find((p) => String(p.name ?? "").trim());
        if (!hit?.name) {
          return "None";
        }
        return firstWords(String(hit.name), 1);
      }

      default:
        break;
    }
  }

  return null;
}
