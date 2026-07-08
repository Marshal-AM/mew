import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SignedPaymentPayload } from "../protocol/signedPayment";

const STORAGE_KEY = "moo_pending_payments_v1";

export type PaymentStatus = "pending" | "confirmed" | "declined" | "held" | "pending_review";

export type PendingPayment = SignedPaymentPayload & {
  id: string;
  status: PaymentStatus;
  createdAt: number;
  txHash?: string;
  confirmedAt?: number;
};

async function loadPending(): Promise<PendingPayment[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as PendingPayment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePending(items: PendingPayment[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function addPendingPayment(payload: SignedPaymentPayload): Promise<PendingPayment> {
  const items = await loadPending();
  const id = `${payload.reqId}-${payload.posNonce}`;
  const existing = items.find((item) => item.id === id);
  if (existing) {
    return existing;
  }

  const entry: PendingPayment = {
    ...payload,
    id,
    status: "pending",
    createdAt: Date.now(),
  };
  items.unshift(entry);
  await savePending(items);
  return entry;
}

export async function listPendingPayments(): Promise<PendingPayment[]> {
  return loadPending();
}

export async function updatePendingStatus(
  id: string,
  status: PaymentStatus,
  extra?: { txHash?: string; confirmedAt?: number }
): Promise<void> {
  const items = await loadPending();
  const idx = items.findIndex((item) => item.id === id);
  if (idx < 0) {
    return;
  }
  items[idx] = {
    ...items[idx],
    status,
    txHash: extra?.txHash ?? items[idx].txHash,
    confirmedAt: extra?.confirmedAt ?? items[idx].confirmedAt,
  };
  await savePending(items);
}

export async function removePendingPayment(id: string): Promise<void> {
  const items = await loadPending();
  await savePending(items.filter((item) => item.id !== id));
}
