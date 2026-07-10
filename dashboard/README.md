# Moo Dashboard (Phase 15)

Next.js merchant dashboard + compliance console for the offline BLE payment system.

## Setup

```bash
cd dashboard
cp .env.example .env
# NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open http://localhost:3000/login

## Routes

| Path | Role | Purpose |
|------|------|---------|
| `/login` | merchant | SIWE wallet login |
| `/compliance/login` | compliance_officer | Compliance officer login |
| `/merchant` | merchant | Revenue overview + recent txs (demo wallet only) |
| `/merchant/transactions` | merchant | Full table, CSV export, Realtime |
| `/merchant/products` | merchant | **POS catalog CRUD + keypad slots 1–9** |
| `/merchant/pos-devices` | merchant | POS device management |
| `/compliance` | compliance_officer | Compliance overview |
| `/compliance/review-queue` | compliance_officer | Release / decline / STR |
| `/compliance/audit-log` | compliance_officer | Searchable audit log |
| `/compliance/frozen` | compliance_officer | Freeze / unfreeze addresses |
| `/compliance/kill-switch` | compliance_officer | System-wide suspension |
| `/compliance/fraud-rules` | compliance_officer | Global fraud thresholds |

## Demo merchant (fixed analytics scope)

Any wallet can sign in at `/login`. All merchant analytics and catalog data are scoped to:

- Wallet: `0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844`
- Merchant ID: `11111111-1111-4111-8111-111111111111`

## Products → POS workflow

1. Add products at **Products** with a **POS key** (1–9).
2. POS firmware syncs via `GET /functions/v1/pos-products?pos_id=POS-001` on boot.
3. Cashier presses the key, enters amount, customer pays (wallet unchanged).
4. POS relays `productId` to `submit-transaction`; backend stores `transactions.product_name`.

## Compliance officer setup

Set Supabase Edge Function secret on `merchant-auth`:

```
COMPLIANCE_OFFICER_WALLETS=0xYourOfficerWallet
```

Sign in at `/compliance/login` with that wallet.

## Database

Run migrations including [`backend/supabase/migrations/20250710150000_phase15_dashboard.sql`](../backend/supabase/migrations/20250710150000_phase15_dashboard.sql) for RPCs and `system_settings`.
