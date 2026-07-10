import { SESSION_STORAGE_KEY } from "@/lib/siwe";

export type DashboardRole = "merchant" | "compliance_officer";

export type DashboardSession = {
  access_token: string;
  refresh_token: string;
  merchant_id?: string;
  wallet_address?: string;
  role: DashboardRole;
};

const SESSION_META_KEY = "moo_dashboard_session_meta";

export function loadSession(): DashboardSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const tokens = JSON.parse(raw) as { access_token: string; refresh_token: string };
    const metaRaw = localStorage.getItem(SESSION_META_KEY);
    const meta = metaRaw
      ? (JSON.parse(metaRaw) as Partial<DashboardSession>)
      : { role: "merchant" as DashboardRole };
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      merchant_id: meta.merchant_id,
      wallet_address: meta.wallet_address,
      role: meta.role ?? "merchant",
    };
  } catch {
    return null;
  }
}

export function saveSession(session: DashboardSession): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
  );
  localStorage.setItem(
    SESSION_META_KEY,
    JSON.stringify({
      merchant_id: session.merchant_id,
      wallet_address: session.wallet_address,
      role: session.role,
    }),
  );
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_META_KEY);
}
