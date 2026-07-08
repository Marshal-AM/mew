export type FraudRuleType = "max_per_tap" | "daily_amount" | "daily_tx_count";

export type FraudRule = {
  rule_type: FraudRuleType | string;
  threshold_value: number;
  merchant_id?: string | null;
};

export type VelocitySnapshot = {
  txCount: number;
  cumulativeAmount: number;
};

export type FraudCheckPass = {
  ok: true;
  projectedCount: number;
  projectedAmount: number;
  rulesChecked: string[];
};

export type FraudCheckFail = {
  ok: false;
  rule: string;
  threshold: number;
  reason: string;
  metadata: Record<string, unknown>;
};

export type FraudCheckResult = FraudCheckPass | FraudCheckFail;
