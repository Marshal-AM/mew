import Constants from "expo-constants";

export type RegisterCustomerResult = {
  customer_id: string;
  screening_status: "cleared" | "blocked" | "pending";
  screening: {
    match: boolean;
    score: number;
    list_source: string | null;
    screened_name: string;
    matched_name?: string;
  };
  error?: string;
};

export type CustomerScreeningRecord = {
  id: string;
  wallet_address: string;
  full_name: string | null;
  screening_status: "cleared" | "blocked" | "pending";
  screened_at: string | null;
};

function getSupabaseUrl(): string | null {
  return process.env.EXPO_PUBLIC_SUPABASE_URL ?? (Constants.expoConfig?.extra?.supabaseUrl as string) ?? null;
}

function getAnonKey(): string | null {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (Constants.expoConfig?.extra?.supabaseAnonKey as string) ?? null;
}

export function isScreeningConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getAnonKey());
}

export async function registerCustomerKyc(
  walletAddress: string,
  fullName: string,
  idDocRef?: string
): Promise<RegisterCustomerResult> {
  const url = getSupabaseUrl();
  const anonKey = getAnonKey();
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured for KYC screening");
  }

  const endpoint = `${url.replace(/\/$/, "")}/functions/v1/register-customer`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      wallet_address: walletAddress,
      full_name: fullName,
      id_doc_ref: idDocRef ?? null,
    }),
  });

  const body = (await res.json()) as RegisterCustomerResult;
  if (!res.ok) {
    throw new Error(body.error ?? `KYC registration failed (${res.status})`);
  }
  return body;
}

export async function getCustomerScreeningRecord(
  walletAddress: string
): Promise<CustomerScreeningRecord | null> {
  const url = getSupabaseUrl();
  const anonKey = getAnonKey();
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured for KYC screening");
  }

  const endpoint =
    `${url.replace(/\/$/, "")}/rest/v1/customers` +
    `?select=id,wallet_address,full_name,screening_status,screened_at` +
    `&wallet_address=eq.${walletAddress.toLowerCase()}` +
    `&limit=1`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Customer screening lookup failed (${res.status})`);
  }

  const rows = (await res.json()) as CustomerScreeningRecord[];
  return rows[0] ?? null;
}
