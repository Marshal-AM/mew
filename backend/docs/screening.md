# Sanctions Screening (Phase 8)

Standalone AML/sanctions screening for the Moo payment system. This traces to **Art. 24** of the PTSR and the UAE AML Law regime (Federal Decree-Law No. 10 of 2025). Screening is **ongoing** (every transaction), not onboarding-only.

## Architecture

- **`screen-entity`** — `POST /functions/v1/screen-entity` with `{ entity_id, entity_type: "customer" | "merchant" }`
- **`register-customer`** — onboarding KYC + screening; sets `customers.screening_status`
- **`sync-sanctions-lists`** — refreshes `sanctions_cache` from bundled list files (daily cron recommended)
- **Phase 7 pipeline step 3** — thin HTTP client only; calls `screen-entity` for payer + payee

Vendor swap (ComplyAdvantage, Chainalysis, etc.) should change **only** `screen-entity` internals.

## Lists

Testnet uses bundled JSON in [`data/sanctions/`](../data/sanctions/). Production should replace `sync-sanctions-lists` with live UN SC + UAE local feeds.

## Threshold

Set `SCREENING_MATCH_THRESHOLD` (default `0.82`) on Edge Functions. Tune as CBUAE guidance evolves.

## Deploy

```bash
cd backend
npx supabase functions deploy screen-entity
npx supabase functions deploy sync-sanctions-lists
npx supabase functions deploy register-customer
npx supabase functions deploy submit-transaction
```

Initial sync:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sync-sanctions-lists" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Schedule daily sync in Supabase Dashboard → Edge Functions → Cron.

## Test fixtures

- `SANCTIONED TEST ENTITY` / `Test Bad Actor` (UN SC)
- `UAE TEST LISTED PERSON` (UAE local)

Onboarding with a matching name returns HTTP 403. Transactions screen payer (customer) and payee (merchant) at pipeline step 3; matches route to `review_queue` with POS status `held`.
