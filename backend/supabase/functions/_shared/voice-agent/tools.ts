import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { geminiEmbedText } from "./gemini_client.ts";

export interface MerchantContext {
  merchant_id: string;
  merchant_name: string;
  payout_address: string;
  pos_id: string;
}

export const TOOL_DECLARATIONS = [
  {
    name: "get_revenue",
    description: "Total confirmed revenue for this merchant over the last N days.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "Number of days to look back (default 7, max 365).",
        },
      },
    },
  },
  {
    name: "get_top_products",
    description: "Top selling products by transaction count for this merchant.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Lookback days (default 30)." },
        limit: { type: "integer", description: "Max products to return (default 5)." },
      },
    },
  },
  {
    name: "get_transaction_count",
    description: "Count transactions for this merchant, optionally filtered by status.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Lookback days (default 7)." },
        status: {
          type: "string",
          description: "Transaction status filter: confirmed, pending, declined, pending_review, held.",
        },
      },
    },
  },
  {
    name: "search_products",
    description: "Fuzzy search this merchant's product catalog by spoken name or description.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product name or phrase to search for." },
        limit: { type: "integer", description: "Max results (default 5)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_account_status",
    description:
      "Check if this merchant's payout address is frozen, system is suspended, or transactions are held for review.",
    parameters: { type: "object", properties: {} },
  },
];

function clampDays(days: unknown, fallback = 7): number {
  const n = typeof days === "number" ? days : fallback;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

function sinceIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function executeTool(
  admin: SupabaseClient,
  ctx: MerchantContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_revenue":
      return getRevenue(admin, ctx, args);
    case "get_top_products":
      return getTopProducts(admin, ctx, args);
    case "get_transaction_count":
      return getTransactionCount(admin, ctx, args);
    case "search_products":
      return searchProducts(admin, ctx, args);
    case "get_account_status":
      return getAccountStatus(admin, ctx);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function getRevenue(
  admin: SupabaseClient,
  ctx: MerchantContext,
  args: Record<string, unknown>,
) {
  const days = clampDays(args.days, 7);
  const since = sinceIso(days);

  const { data, error } = await admin
    .from("transactions")
    .select("amount")
    .eq("merchant_id", ctx.merchant_id)
    .eq("status", "confirmed")
    .gte("confirmed_at", since);

  if (error) {
    throw error;
  }

  const revenue = (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return { days, revenue, currency: "token units" };
}

async function getTopProducts(
  admin: SupabaseClient,
  ctx: MerchantContext,
  args: Record<string, unknown>,
) {
  const days = clampDays(args.days, 30);
  const limit = Math.max(1, Math.min(20, Math.floor(Number(args.limit ?? 5))));
  const since = sinceIso(days);

  const { data, error } = await admin
    .from("transactions")
    .select("product_name, amount")
    .eq("merchant_id", ctx.merchant_id)
    .eq("status", "confirmed")
    .gte("confirmed_at", since)
    .not("product_name", "is", null);

  if (error) {
    throw error;
  }

  const counts = new Map<string, { count: number; revenue: number }>();
  for (const row of data ?? []) {
    const name = String(row.product_name ?? "").trim();
    if (!name) continue;
    const cur = counts.get(name) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(row.amount ?? 0);
    counts.set(name, cur);
  }

  const top = [...counts.entries()]
    .map(([product_name, stats]) => ({ product_name, ...stats }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, limit);

  if (top.length > 0) {
    return { days, products: top };
  }

  const { data: catalog, error: catErr } = await admin
    .from("products")
    .select("name")
    .eq("merchant_id", ctx.merchant_id)
    .eq("active", true)
    .order("pos_slot")
    .limit(limit);

  if (catErr) {
    throw catErr;
  }

  return {
    days,
    products: (catalog ?? []).map((p) => ({
      product_name: String(p.name ?? "").trim(),
      count: 0,
      revenue: 0,
    })).filter((p) => p.product_name),
    from_catalog: true,
  };
}

async function getTransactionCount(
  admin: SupabaseClient,
  ctx: MerchantContext,
  args: Record<string, unknown>,
) {
  const days = clampDays(args.days, 7);
  const since = sinceIso(days);
  const status = typeof args.status === "string" ? args.status.trim() : "";

  let q = admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", ctx.merchant_id)
    .gte("created_at", since);

  if (status) {
    q = q.eq("status", status);
  }

  const { count, error } = await q;
  if (error) {
    throw error;
  }

  return { days, status: status || "all", count: count ?? 0 };
}

async function searchProducts(
  admin: SupabaseClient,
  ctx: MerchantContext,
  args: Record<string, unknown>,
) {
  const query = String(args.query ?? "").trim();
  if (!query) {
    return { products: [], message: "empty query" };
  }

  const limit = Math.max(1, Math.min(20, Math.floor(Number(args.limit ?? 5))));

  try {
    const embedding = await geminiEmbedText(query);
    const { data, error } = await admin.rpc("agent_match_products", {
      p_merchant_id: ctx.merchant_id,
      p_embedding: embedding,
      p_limit: limit,
    });

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      return { query, products: data };
    }
  } catch (err) {
    console.warn("[voice-agent] vector search failed, falling back to ilike:", err);
  }

  const { data: fallback, error: fbErr } = await admin
    .from("products")
    .select("id, name, sku, price, pos_slot")
    .eq("merchant_id", ctx.merchant_id)
    .eq("active", true)
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
    .limit(limit);

  if (fbErr) {
    throw fbErr;
  }

  return { query, products: fallback ?? [], fallback: true };
}

async function getAccountStatus(admin: SupabaseClient, ctx: MerchantContext) {
  const payout = ctx.payout_address.toLowerCase();

  const { data: frozen } = await admin
    .from("frozen_addresses")
    .select("address, reason, freeze_type")
    .eq("address", payout)
    .maybeSingle();

  const { data: suspensionRow } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "system_suspended")
    .maybeSingle();

  const suspended = Boolean(
    (suspensionRow?.value as { suspended?: boolean } | null)?.suspended,
  );

  const { count: heldCount } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", ctx.merchant_id)
    .in("status", ["pending_review", "held"]);

  const { count: pendingCount } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", ctx.merchant_id)
    .eq("status", "pending");

  return {
    payout_frozen: Boolean(frozen),
    freeze_reason: frozen?.reason ?? null,
    system_suspended: suspended,
    held_or_review_count: heldCount ?? 0,
    pending_count: pendingCount ?? 0,
    merchant_name: ctx.merchant_name,
  };
}
