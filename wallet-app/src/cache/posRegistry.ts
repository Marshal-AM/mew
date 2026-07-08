import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAddress, isAddress } from "ethers";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

const STORAGE_KEY = "moo_pos_registry_v2";

export type RegistryEntry = {
  payoutAddress: string;
  source: "remote" | "local";
  updatedAt: string;
};

type RegistryStore = {
  lastSyncedAt: string | null;
  entries: Record<string, RegistryEntry>;
};

async function loadStore(): Promise<RegistryStore> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { lastSyncedAt: null, entries: {} };
  }
  try {
    const parsed = JSON.parse(raw) as RegistryStore;
    return parsed?.entries ? parsed : { lastSyncedAt: null, entries: {} };
  } catch {
    return { lastSyncedAt: null, entries: {} };
  }
}

async function saveStore(store: RegistryStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function syncPosRegistryFromServer(): Promise<{ count: number; lastSyncedAt: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase
    .from("pos_devices_public")
    .select("pos_id,payout_address,updated_at");
  if (error) {
    throw new Error(error.message);
  }

  const store = await loadStore();
  const now = new Date().toISOString();
  for (const row of data ?? []) {
    if (!row.pos_id || !row.payout_address) continue;
    const local = store.entries[row.pos_id];
    if (local?.source === "local") continue;
    store.entries[row.pos_id] = {
      payoutAddress: getAddress(row.payout_address),
      source: "remote",
      updatedAt: row.updated_at ?? now,
    };
  }
  store.lastSyncedAt = now;
  await saveStore(store);
  return { count: data?.length ?? 0, lastSyncedAt: now };
}

export async function fetchPosDevice(posId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const trimmed = posId.trim();
  const { data, error } = await supabase
    .from("pos_devices_public")
    .select("pos_id,payout_address,updated_at")
    .eq("pos_id", trimmed)
    .maybeSingle();
  if (error || !data?.payout_address) return null;

  const store = await loadStore();
  const payoutAddress = getAddress(data.payout_address);
  const local = store.entries[trimmed];
  if (!local || local.source !== "local") {
    store.entries[trimmed] = {
      payoutAddress,
      source: "remote",
      updatedAt: data.updated_at ?? new Date().toISOString(),
    };
    await saveStore(store);
  }
  return payoutAddress;
}

export async function setPayoutAddress(posId: string, payoutAddress: string): Promise<void> {
  const trimmedPosId = posId.trim();
  if (trimmedPosId.length === 0) throw new Error("posId is required");
  if (!isAddress(payoutAddress)) throw new Error("Invalid payout address");

  const store = await loadStore();
  store.entries[trimmedPosId] = {
    payoutAddress: getAddress(payoutAddress),
    source: "local",
    updatedAt: new Date().toISOString(),
  };
  await saveStore(store);
}

export async function getPayoutAddress(posId: string, options?: { allowFetch?: boolean }): Promise<string> {
  const trimmedPosId = posId.trim();
  const store = await loadStore();
  const cached = store.entries[trimmedPosId];
  if (cached) return cached.payoutAddress;

  if (options?.allowFetch !== false) {
    const fetched = await fetchPosDevice(trimmedPosId);
    if (fetched) return fetched;
  }

  throw new Error(
    `No payout address for ${trimmedPosId}. Connect to the internet and sync the POS registry, or ask the merchant to register the device in the dashboard.`
  );
}

export async function listPosRegistry(): Promise<Record<string, string>> {
  const store = await loadStore();
  const out: Record<string, string> = {};
  for (const [posId, entry] of Object.entries(store.entries)) {
    out[posId] = entry.payoutAddress;
  }
  return out;
}

export async function getRegistryMeta(): Promise<{ lastSyncedAt: string | null; deviceCount: number }> {
  const store = await loadStore();
  return { lastSyncedAt: store.lastSyncedAt, deviceCount: Object.keys(store.entries).length };
}

export function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
