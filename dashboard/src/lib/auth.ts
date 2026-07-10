import type { DashboardRole } from "@/lib/session";

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function roleFromToken(accessToken: string): DashboardRole {
  const payload = decodeJwtPayload(accessToken);
  const appMeta = payload?.app_metadata as Record<string, unknown> | undefined;
  if (appMeta?.role === "compliance_officer") return "compliance_officer";
  return "merchant";
}

export function requireRole(actual: DashboardRole, allowed: DashboardRole[]): boolean {
  return allowed.includes(actual);
}
