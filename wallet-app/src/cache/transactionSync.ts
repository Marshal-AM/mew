import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import {
  listPendingPayments,
  updatePendingStatus,
  type PaymentStatus,
  type PendingPayment,
} from "./pendingPayments";

export type ServerTransaction = {
  id: string;
  req_id: string;
  pos_id: string;
  pos_nonce: string;
  auth_nonce: string;
  amount: number;
  status: string;
  tx_hash: string | null;
  confirmed_at: string | null;
  from_address: string;
};

const TERMINAL_STATUSES = new Set(["confirmed", "declined", "pending_review", "held"]);

function mapServerStatus(status: string): PaymentStatus | null {
  if (status === "confirmed") return "confirmed";
  if (status === "declined") return "declined";
  if (status === "pending_review") return "pending_review";
  if (status === "held") return "held";
  if (status === "pending") return "pending";
  return null;
}

export async function syncTransactionsForWallet(walletAddress: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return 0;
  }

  const normalized = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, req_id, pos_id, pos_nonce, auth_nonce, amount, status, tx_hash, confirmed_at, from_address")
    .eq("from_address", normalized);

  if (error) {
    throw new Error(error.message);
  }

  const serverRows = (data ?? []) as ServerTransaction[];
  const local = await listPendingPayments();
  let updated = 0;

  for (const row of serverRows) {
    const mapped = mapServerStatus(row.status);
    if (!mapped || !TERMINAL_STATUSES.has(row.status)) {
      continue;
    }

    const match = local.find(
      (item) =>
        item.posId === row.pos_id &&
        item.posNonce === row.pos_nonce &&
        item.status === "pending"
    );

    if (match) {
      await updatePendingStatus(match.id, mapped, {
        txHash: row.tx_hash ?? undefined,
        confirmedAt: row.confirmed_at ? Date.parse(row.confirmed_at) : undefined,
      });
      updated++;
    }
  }

  return updated;
}

export function statusLabel(status: PaymentStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "declined":
      return "Declined";
    case "held":
      return "Held";
    case "pending_review":
      return "Under review";
    default:
      return "Pending";
  }
}

export type HistoryEntry = PendingPayment;

export async function loadPaymentHistory(): Promise<HistoryEntry[]> {
  return listPendingPayments();
}
