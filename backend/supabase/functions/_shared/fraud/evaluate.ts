import type { FraudCheckResult, FraudRule, VelocitySnapshot } from "./types.ts";

const RULE_ORDER: Array<FraudRule["rule_type"]> = ["max_per_tap", "daily_tx_count", "daily_amount"];

function rulePriority(ruleType: string): number {
  const idx = RULE_ORDER.indexOf(ruleType);
  return idx === -1 ? RULE_ORDER.length : idx;
}

export function evaluateFraudRules(
  rules: FraudRule[],
  amount: number,
  snapshot: VelocitySnapshot,
  wallet?: string
): FraudCheckResult {
  const sorted = [...rules].sort((a, b) => rulePriority(a.rule_type) - rulePriority(b.rule_type));
  const rulesChecked: string[] = [];

  for (const rule of sorted) {
    const threshold = Number(rule.threshold_value);
    rulesChecked.push(rule.rule_type);

    if (rule.rule_type === "max_per_tap" && amount > threshold) {
      return {
        ok: false,
        rule: rule.rule_type,
        threshold,
        reason: "Per-tap amount limit exceeded",
        metadata: { rule: rule.rule_type, threshold, amount, wallet },
      };
    }

    if (rule.rule_type === "daily_tx_count" && snapshot.txCount + 1 > threshold) {
      return {
        ok: false,
        rule: rule.rule_type,
        threshold,
        reason: "Daily transaction count limit exceeded",
        metadata: {
          rule: rule.rule_type,
          threshold,
          currentCount: snapshot.txCount,
          wallet,
        },
      };
    }

    if (rule.rule_type === "daily_amount" && snapshot.cumulativeAmount + amount > threshold) {
      return {
        ok: false,
        rule: rule.rule_type,
        threshold,
        reason: "Daily amount limit exceeded",
        metadata: {
          rule: rule.rule_type,
          threshold,
          currentAmount: snapshot.cumulativeAmount,
          amount,
          wallet,
        },
      };
    }
  }

  return {
    ok: true,
    projectedCount: snapshot.txCount + 1,
    projectedAmount: snapshot.cumulativeAmount + amount,
    rulesChecked,
  };
}
