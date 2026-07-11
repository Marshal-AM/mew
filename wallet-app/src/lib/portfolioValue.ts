import type { TokenBalance } from "@/chain/balances";

/** Hardcoded display rates: 1 token → AED (portfolio summary only). */
export const TOKEN_AED_RATES = {
  AE: 1,
  MOO: 1,
  POL: 0.85,
} as const;

export function tokenValueAed(balance: TokenBalance): number | null {
  if (balance.error) return null;
  const rate = TOKEN_AED_RATES[balance.symbol as keyof typeof TOKEN_AED_RATES];
  if (rate == null) return null;
  const amount = parseFloat(balance.balance);
  if (!Number.isFinite(amount)) return null;
  return amount * rate;
}

export function totalPortfolioAed(balances: TokenBalance[]): number {
  return balances.reduce((sum, item) => sum + (tokenValueAed(item) ?? 0), 0);
}

export function formatAed(value: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
