# Fraud / Velocity Engine (Phase 9)

Deterministic fraud-monitoring rules for the Moo payment pipeline (PTSR Art. 35(22)). Rules are **explainable**, **configurable in the database**, and evaluated at pipeline step 4 before balance check or on-chain settlement.

## Rule types

| `rule_type` | Description | Boundary |
|-------------|-------------|----------|
| `max_per_tap` | Hard cap on a single BLE payment amount (USDC) | Pass when `amount <= threshold`; held when `amount > threshold` |
| `daily_amount` | Max cumulative amount per wallet per UTC calendar day | Pass when `current + amount <= threshold` |
| `daily_tx_count` | Max transaction count per wallet per UTC day | Pass when `currentCount + 1 <= threshold` |

Global rules have `merchant_id IS NULL`. Merchant-specific rules can tighten limits for a single merchant.

## Counter semantics

`velocity_counters` tracks approved settlements only:

1. **Step 4 (`fraud.velocity`)** — read-only check against current counters; no writes.
2. **After full pipeline approval** — `increment_velocity_counter` RPC atomically bumps `tx_count` and `cumulative_amount`.

Held or declined transactions do **not** increment counters.

## Hold behavior

When a rule breaches:

- Pipeline halts at step 4 with `halt: held`
- POS receives `status: held`
- `transactions.status` → `pending_review`
- `review_queue` gets an open entry
- `audit_log` step `fraud.velocity` records `result: flagged` with rule metadata

## Editing thresholds (no deploy)

### Compliance dashboard

`/compliance` → **Fraud Rules** section lists rules and updates global thresholds via `compliance_upsert_fraud_rule`.

### SQL / RPC

```sql
SELECT * FROM compliance_fetch_fraud_rules();

SELECT compliance_upsert_fraud_rule('max_per_tap', 500, NULL, true);
```

## Module layout

- [`functions/_shared/fraud/evaluate.ts`](../supabase/functions/_shared/fraud/evaluate.ts) — pure rule evaluation
- [`functions/_shared/fraud/velocity.ts`](../supabase/functions/_shared/fraud/velocity.ts) — counter read + post-approval increment
- Pipeline step 4 in [`functions/_shared/pipeline/steps.ts`](../supabase/functions/_shared/pipeline/steps.ts)
- Post-approval increment in [`functions/_shared/pipeline/runPipeline.ts`](../supabase/functions/_shared/pipeline/runPipeline.ts)

## Deploy

1. Run migration [`migrations/20250708130000_phase9_fraud.sql`](../supabase/migrations/20250708130000_phase9_fraud.sql) in Supabase SQL Editor.
2. Redeploy pipeline: `npx supabase functions deploy submit-transaction`

No new Edge Function — fraud engine is bundled in `_shared`.

## Tests

```bash
cd backend
npm run test:fraud
```

Integration tests temporarily lower thresholds and verify held transactions land in `review_queue` with audit metadata at step `fraud.velocity`.

## Defaults (seeded)

| Rule | Global threshold |
|------|------------------|
| `max_per_tap` | 500 USDC |
| `daily_amount` | 10,000 USDC |
| `daily_tx_count` | 50 |

## Deferred (per spec)

- Weekly velocity windows
- Tx-count-in-M-minutes, first-time-payee, geo/device anomaly rules
