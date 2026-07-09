# Moo

Offline BLE → Polygon POS payment system. A mobile wallet signs EIP-3009 `transferWithAuthorization` messages offline, transmits them to an ESP32 POS over BLE, and a backend pipeline relayer settles on Polygon Amoy.

## Monorepo layout

| Package | Description |
|---------|-------------|
| [`contracts/`](contracts/) | Hardhat — EIP-3009 PayToken + deploy/relay scripts |
| [`wallet-app/`](wallet-app/) | Expo/React Native offline wallet |
| [`pos-firmware/`](pos-firmware/) | ESP32 POS firmware (PlatformIO) |
| [`backend/`](backend/) | Supabase migrations + Edge Functions |
| [`dashboard/`](dashboard/) | Next.js merchant dashboard |

See [`docs/phaseDocs.md`](docs/phaseDocs.md) for the full phase-wise implementation plan.

## Prerequisites

- Node.js 18+
- npm (workspaces)
- PlatformIO CLI (for `pos-firmware`)
- Supabase CLI (for `backend` local dev)

## Setup

```bash
cp .env.example .env
# Fill in PRIVATE_KEY, AMOY_RPC_URL, POLYGONSCAN_API_KEY

npm install
```

## Commands

### Contracts (Phase 1)

```bash
cd contracts
npm run compile
npm run test
npm run deploy:amoy    # deploy PaymentForwarder + test token to Amoy
npm run relay          # relay any approved ERC-20 via the forwarder
                       #   --token 0x... --amount 5 --decimals 6 --to 0x...
```

**Architecture:** `PaymentForwarder` handles offline EIP-3009-style authorizations for **any standard ERC-20**. The payer approves the forwarder once per token (while online), then signs offline payments that include the token address. `PayToken` is only a mintable test token for Amoy demos.

### Wallet app (Phase 2)

Requires a **development build** — not Expo Go (native crypto + secure store).

```bash
cd wallet-app
cp .env.example .env          # optional: custom EXPO_PUBLIC_AMOY_RPC_URL
npm install                   # from repo root, or here via workspaces
npx expo prebuild             # generate android/ and ios/ native projects
npx expo run:android          # install on a physical Android device (USB debugging)
```

**Features:** create/import wallet (BIP-39), mnemonic in `expo-secure-store`, live Amoy balances (POL + MOO), receive QR, **Pay tab** (Phase 5: QR scan, biometric-gated EIP-712 signing, BLE signed payload, pending-only UI), sign test, logout.

**Phase 5 manual test**

1. Run `backend/supabase/setup.sql` in Supabase, configure env vars, deploy edge functions, then set `POS-001` payout in the **dashboard** (`/pos-devices`). Wallet syncs on unlock or via Settings -> Sync POS registry.
2. While online, fund MOO and approve `PaymentForwarder` (use `npm run relay` once or approve via Hardhat).
3. Scan POS QR → confirm amount/payee → biometric/PIN → BLE send. UI shows **Pending** until the backend pipeline confirms.
4. Repeat in airplane mode — signing and BLE still work offline; status syncs when back online.

After pulling native-module changes (BLE, camera, biometrics), re-run `npx expo prebuild` before `npx expo run:android`.

```bash
npm run typecheck
npm run test:protocol
npm run test:signing
npm run test:auth-gate
```



### Backend + dashboard (Phase 6)

1. Paste [`backend/supabase/setup.sql`](backend/supabase/setup.sql) into Supabase SQL Editor (or `cd backend && npx supabase db reset`).
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env`; mirror public keys into `wallet-app/.env` and `dashboard/.env`.
3. Deploy edge function: `cd backend && npx supabase functions deploy merchant-auth`.
4. Dashboard: `cd dashboard && npm run dev` -> `/login` (wallet SIWE) -> `/pos-devices` to manage POS devices.
5. Wallet: unlock online -> auto-sync POS registry; offline pay uses cached payout addresses.

```bash
cd backend
npm run test:sql
npm run test:rls        # requires live Supabase project
npm run test:pipeline   # step-order + EIP-712 tests; integration if SUPABASE_URL set
```

### Backend pipeline (Phase 7)

1. Run Phase 7 migration [`backend/supabase/migrations/20250708110000_phase7_schema.sql`](backend/supabase/migrations/20250708110000_phase7_schema.sql) on Supabase (or re-paste updated `setup.sql` on a fresh project).
2. In Supabase **Edge Function secrets**, set:
   - `RELAYER_PRIVATE_KEY` (Amoy-funded relayer wallet)
   - `AMOY_RPC_URL`
   - `PAYMENT_FORWARDER_ADDRESS` = `0x9F0BF4aE6BBfD51eDbff77eA0D17A7bec484bb97`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected on deploy)
3. Deploy: `cd backend && npx supabase functions deploy submit-transaction`
4. Fund the relayer with Amoy MATIC. Ensure payers have MOO balance + forwarder allowance.
5. Flash POS with WiFi + backend flags in `pos-firmware/platformio.ini` (see [`pos-firmware/README.md`](pos-firmware/README.md)).
6. **E2E:** POS amount → QR → wallet pay → POS shows **APPROVED** → wallet History shows **Confirmed** with `tx_hash`.

The pipeline runs 7 ordered steps (signature → replay → **sanctions screen** → fraud → balance → on-chain relay → audit) before responding to the POS. Manual `contracts/scripts/relay.ts` remains for dev debugging.

### Sanctions screening (Phase 8)

1. Run Phase 8 migration [`backend/supabase/migrations/20250708120000_phase8_screening.sql`](backend/supabase/migrations/20250708120000_phase8_screening.sql).
2. Deploy: `screen-entity`, `sync-sanctions-lists`, `register-customer`; redeploy `submit-transaction`.
3. Run initial list sync: `POST .../functions/v1/sync-sanctions-lists` (see [`backend/docs/screening.md`](backend/docs/screening.md)).
4. Optional: set `SCREENING_MATCH_THRESHOLD` (default `0.82`) on Edge Functions.
5. Wallet onboarding now includes KYC name capture + pre-fund screening.
6. **E2E:** register with name `SANCTIONED TEST ENTITY` → blocked; cleared user paying merchant on sanctions list → POS **HELD** at step 3.

```bash
cd backend
npm run test:screening
```

### Fraud / velocity engine (Phase 9)

1. Run Phase 9 migration [`backend/supabase/migrations/20250708130000_phase9_fraud.sql`](backend/supabase/migrations/20250708130000_phase9_fraud.sql).
2. Redeploy: `npx supabase functions deploy submit-transaction`
3. Global defaults: `max_per_tap` 500 USDC, `daily_amount` 10,000 USDC, `daily_tx_count` 50.
4. Edit thresholds via dashboard **Compliance** → Fraud Rules, or `compliance_upsert_fraud_rule` RPC (see [`backend/docs/fraud.md`](backend/docs/fraud.md)).
5. **E2E:** transaction over per-tap cap → POS **HELD** at step 4; cumulative daily breach → held with `review_queue` + audit metadata.

```bash
cd backend
npm run test:fraud
```

### Standalone Android APK build on Windows

To build a standalone release APK from a Windows machine, use the wallet preflight and build scripts. They force:

- short Gradle and temp paths (`C:\g`, `C:\t`)
- `arm64-v8a` only, which matches modern Android phones
- a temporary `M:` mapped drive to keep native build paths short

```bash
cd wallet-app
npm run release:preflight
npm run build:apk
```

The preflight script checks Android SDK, NDK, CMake/Ninja, Node module resolution, and runs a Gradle smoke test before the real release build starts.

**iOS:** `npx expo run:ios` requires macOS + Xcode, or use [EAS Build](https://docs.expo.dev/build/introduction/) in the cloud.

### Android Studio + SDK (Windows)

Android Studio (`C:\Program Files\Android\Android Studio`) is the IDE — the **SDK** is separate and usually lives at:

`C:\Users\MSI\AppData\Local\Android\Sdk`

1. Open **Android Studio** once and finish the setup wizard (downloads SDK + platform-tools).
2. In SDK Manager, ensure **Android SDK Platform 35** (or 34) and **Build-Tools** are installed.
3. Enable **USB debugging** on your phone, connect via USB, then:

```bash
cd wallet-app
npx expo run:android
```

`wallet-app/android/local.properties` points `sdk.dir` at the default SDK path above.

### Dashboard

```bash
cd dashboard
npm run lint
npm run build
```

### POS firmware

See [`pos-firmware/README.md`](pos-firmware/README.md) for wiring, build envs, and hardware test steps.

```bash
cd pos-firmware
pio run -e esp32-s3-oled       # ESP32-S3 + SSD1306 OLED (default)
pio run -e esp32-oled          # Classic ESP32 + OLED
pio run -e esp32-s3-oled -t upload
pio device monitor
```

### Backend

```bash
cd backend
npm run lint
```

## Network

- **Chain:** Polygon Amoy testnet
- **Chain ID:** `80002`
- **RPC:** `https://rpc-amoy.polygon.technology/`
- **Explorer:** https://amoy.polygonscan.com
