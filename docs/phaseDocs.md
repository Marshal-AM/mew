# Offline BLE → Polygon POS Payment System — Full Phase-Wise Implementation Plan (v2: Technical + Regulatory/Compliance Integrated)

**System summary:** A customer holds crypto in an Expo/React Native mobile wallet with **no internet**. They scan a QR code on an **ESP32-based POS terminal** (which has internet). The wallet **signs an off-chain payment authorization** (EIP-3009-style, no chain state needed at signing time) and transmits it to the POS over **BLE**. The POS is a **dumb relay** — it never makes settlement decisions locally — and forwards the signed payload to a **backend transaction pipeline** that runs signature verification, replay protection, sanctions/AML screening, fraud/velocity checks, and a balance check, *before* submitting to **Polygon Amoy testnet** and writing an audit log. Everything is recorded in **Supabase**, powering a **merchant dashboard**, a **compliance review queue**, and a **kill switch**. The POS also has mic/speaker/keypad: long-pressing `0` records a voice question, answered by **Gemini** (audio-in, function-calling against Supabase, audio-out).

This version fully integrates the CBUAE PTSR / UAE AML-Law compliance requirements you provided (Art. 35(3),(18)–(22); Art. 23(1)(2)(4); Art. 22(7)(8)(a); Art. 24; Art. 54; FIU freeze/suspend powers) into the architecture — nothing from either prior document is dropped.

Core design decision that still shapes everything: **the wallet never signs a raw Ethereum transaction.** It signs an off-chain EIP-712 `transferWithAuthorization` message with a random nonce, which is what makes fully-offline signing possible without knowing chain state. Everything added in this revision — MFA-gated signing, the backend pipeline, sanctions screening, fraud engine, audit log, segregation, review queue, kill switch — wraps *around* that core mechanism rather than replacing it.

---

## Phase 0 — Foundations & Repository Architecture
**Objective:** Stand up the monorepo, environments, and now also the *compliance-adjacent accounts* everything downstream depends on.

**Repo layout**
```
/contracts        # EIP-3009 token + registry + freeze/blocklist hooks
/wallet-app        # Expo/React Native app
/pos-firmware      # ESP32 Arduino/PlatformIO project (dumb relay)
/backend           # Supabase project + transaction pipeline + screening/fraud/audit services
/dashboard         # Merchant dashboard + compliance review console
```
**Environments**
- Polygon **Amoy testnet** (chainId `80002`, RPC `https://rpc-amoy.polygon.technology/`, explorer `amoy.polygonscan.com`) — current officially maintained Polygon PoS testnet.
- Amoy faucet funds for the relayer wallet (Alchemy/QuickNode faucets — the original official faucet is retired).
- Supabase project.
- Gemini API key.
- **New:** accounts/API access for a sanctions-list data source (even a stub/local UN Security Council + UAE local terrorist list for a testnet build), and a placeholder integration point for a commercial AML vendor (ComplyAdvantage/Chainalysis-style) for later.

**Testing:** CI skeleton, lint/typecheck only.
**Exit Criteria:** Five empty-but-building projects (contracts, wallet, POS firmware, backend, dashboard), Amoy RPC reachable, relayer wallet funded, a sanctions-list data source identified (even if just a static seed file for now).

---

## Phase 1 — Smart Contracts: EIP-3009 Payment Token + Kill-Switch Hooks
**Objective:** Deploy a contract that lets a holder authorize a transfer entirely offline, safely relayable exactly once — and that can be **frozen at the contract level**, since a real kill switch shouldn't only live in application code.

**Why EIP-3009, unchanged from before:** normal transactions need a live nonce/gas read; EIP-3009's random `bytes32` nonce lets an offline device sign with zero chain coordination and no collision risk across concurrent authorizations.

**Contract model**
- `PayToken` (custom ERC-20): `transferWithAuthorization` / `receiveWithAuthorization`, `authorizationState(authorizer, nonce) → bool`, EIP-712 domain separator, per-authorizer nonce-used mapping — as before. Reference: **[`TheGreatAxios/eip3009-forwarder`](https://github.com/TheGreatAxios/eip3009-forwarder)**, either forked directly into your token or deployed as a forwarder in front of a plain OpenZeppelin ERC-20.
- **New — `blocklist` mapping + `frozen` modifier:** add `mapping(address => bool) public isFrozen`, checked in `transferWithAuthorization`/`receiveWithAuthorization` (revert if `isFrozen[from] || isFrozen[to]`), settable only by a designated **compliance admin** address (a multisig or your backend's admin key, itself gated — see Phase 13, Kill Switch). This gives the kill switch real teeth: even if some other relayer path existed, a frozen address's tokens simply cannot move on-chain, not just "our backend refuses to help."
- Prefer `receiveWithAuthorization` over `transferWithAuthorization` for the payer→merchant leg if you want only *your own* relayer key to ever be able to execute settlements (recipient-bound submission) — this matters more now that settlement is gated behind a compliance pipeline; you don't want a permissionless third-party relayer able to bypass your sanctions/fraud checks by directly relaying a valid signature itself.
- `PosRegistry` (optional): on-chain `posId → payoutAddress`; Supabase-only mapping is still the simpler MVP default.

**Testing:** unit tests as before (replay rejected, expiry enforced, wrong signer rejected) **plus**: a frozen address's authorization reverts even with a perfectly valid signature and unused nonce; unfreezing restores normal operation; only the compliance admin key can freeze/unfreeze.
**Exit Criteria:** Freeze a test address on Amoy, attempt a valid `transferWithAuthorization` against it, confirm on-chain revert — proven on the explorer, not asserted.

---

## Phase 2 — Mobile Wallet App: Key Management, MFA, and Secure Auth
**Objective:** Rebuilt from the original "just secure-store a seed phrase" design into a compliance-grade custody model: **the private key must never fully exist in one place**, and **every signing operation requires a fresh biometric/PIN gate** (Art. 35(18)).

**Key management**
- Do **not** store a raw private key in your DB or in plain app storage, ever.
- Two acceptable models, pick one deliberately:
  1. **Secure-enclave-only (simpler, good for MVP/testnet):** key material generated and held inside iOS Secure Enclave / Android Keystore, never exported, signing requests proxied through the enclave's own biometric-gated API. Satisfies "never in one place" only in the weak sense (it's still one device) — acceptable as an interim step, document it as such.
  2. **MPC 2-of-2 (device + your server), the fuller answer to Art. 54's custody-safeguarding intent:** neither the device nor the server alone holds a complete key; every signature requires a threshold signing round between them. This is materially more engineering (a signing-coordination service, key-share generation/rotation, share-recovery UX) — plan it as a distinct workstream, likely via an existing MPC SDK rather than rolling your own cryptography.
  - **Important tension to resolve explicitly:** the whole premise of Phase 5's offline signing is that the wallet can sign **without any network call**. A 2-of-2 MPC scheme where one share lives on *your server* normally requires an interactive round with that server at signing time — which breaks offline signing. If you go the MPC route, you need a variant that supports **pre-authorized offline signing shares** (e.g., a time-boxed, device-only "spending session" key derived from the MPC ceremony while last online, used offline until it expires) — decide this explicitly before building, don't discover the conflict mid-implementation.
- **MFA before every signing operation (Art. 35(18)):** immediately before constructing and signing the EIP-712 payload (Phase 5), gate with `expo-local-authentication` (biometric) or a PIN — this is device possession + biometric/PIN, satisfying the MFA requirement at the point that matters most (the moment funds move), not just at login.

**Auth (separate from signing-gate, this is app login)**
- Login: password/biometric **+ a second factor** (OTP or a device-bound key challenge) — never single-factor.
- **OTP expiry/lockout (Art. 35(20)):** OTP validity window **30–120 seconds**, enforced **server-side** (not just client-side timer cosmetics), single-use (invalidate immediately on use or on any failed attempt beyond your configured limit), with a **server-side lockout counter** — a client that resets its own retry counter on reinstall must not reset the server's.
- **Encrypted credential transmission (Art. 35(19)):** all password/credential fields travel over a channel encrypted client-to-verification-service end-to-end. If you run a gateway/proxy in front of Supabase Auth or a custom auth service, verify it does **not** terminate TLS and re-forward internally in plaintext — audit this explicitly, it's a common accidental violation in API-gateway setups.

**Testing:** brute-force an OTP past the configured limit → server-side lockout triggers (confirm it survives app reinstall/client-state reset); intercept the credential channel with a proxy and confirm no plaintext password is observable at any hop; attempt a signing operation with a stale/no biometric session → rejected.
**Exit Criteria:** No signing operation is possible without a fresh biometric/PIN check immediately prior; no raw private key is ever recoverable from device storage, app backups, or any backend table; OTP lockout is enforced server-side and provably survives client-side state resets.

---

## Phase 3 — POS Firmware: ESP32 Core, Keypad, QR Display — "Dumb Relay" Design
**Objective:** A POS device that generates payment requests and displays results, but makes **zero settlement decisions locally** — this is now an explicit compliance/security design constraint (Art. 35(3): minimizing attack surface via effective risk-management architecture), not just a convenience choice.

**Hardware:** ESP32/ESP32-S3, 4×4 matrix keypad, OLED/TFT display — unchanged from before.

**Firmware components**
- Keypad via the **Keypad library (Mark Stanley & Alexander Brevig)**, standard row/col scanning, `0–9` for price entry, `#` confirm, `*` clear, long-press `0` reserved for voice (Phase 16).
- QR generation/display via **[`yoprogramo/ESP_QRcode`](https://github.com/yoprogramo/ESP_QRcode)** (OLED/TFT/E-INK) or **[`dsilletti/TFT_eSPI_QRcode`](https://github.com/dsilletti/TFT_eSPI_QRcode)** (TFT_eSPI displays), with **[`PhillipJacobsen/Generate_Display_QRcode_ESP32_OLED_TFT`](https://github.com/PhillipJacobsen/Generate_Display_QRcode_ESP32_OLED_TFT)** as a second reference.
- **New — nonce generation moved explicitly to the POS, per the new spec:** the POS generates a **unique nonce per transaction request** as part of the advertised payment request (amount, merchant ID, nonce) — this is the replay-protection anchor from the POS side, complementing (not replacing) the EIP-3009 signature nonce generated by the wallet. QR/BLE payload becomes: `{posId, amt, reqId, posNonce, exp}`.
- **Dumb-relay rule, made explicit in firmware:** the POS **never** independently calls the chain, **never** independently decides "this settled," and **never** shows "success" optimistically. It only ever displays: `pending` (sent to backend, awaiting response) → `approved` / `declined` / `held for review` (Phase 12), driven entirely by the backend's response over HTTPS/Realtime. If the POS is physically compromised, the worst case is a device-level breach with no funds logic and no customer keys ever present on it to steal.

**Testing:** confirm the POS never transitions its display state except in direct response to a backend message; confirm nonce uniqueness across thousands of generated requests (no birthday-collision risk at expected transaction volume).
**Exit Criteria:** POS device can only ever reach an "approved/declined/held" state via an explicit backend response — verified by physically disconnecting the POS's WiFi mid-flow and confirming it hangs on "pending" indefinitely rather than ever guessing a result.

---

## Phase 4 — BLE Transport: POS Peripheral ↔ Wallet Central
**Objective:** Unchanged in mechanics from the original plan — get chunked bytes moving reliably in both directions — now explicitly carrying the POS-generated nonce as part of the payment request payload.

**Role assignment:** POS = BLE peripheral/GATT server (always-on, fewer OS restrictions); wallet = BLE central/GATT client (scans after QR scan gives it the POS's identity).

**POS side:** **[`h2zero/NimBLE-Arduino`](https://github.com/h2zero/NimBLE-Arduino)** — lower flash/RAM footprint and better stability than stock Bluedroid `BLEDevice` for this GATT-server use case; one custom service with a write characteristic (wallet→POS) and a notify characteristic (POS→wallet acks/status). Enable SMP bonding/passkey (`NimBLEDevice::setSecurityAuth/setSecurityPasskey/setSecurityIOCap`) so BLE traffic is encrypted, not just plaintext-sniffable — Espressif's own `bleprph` NimBLE example is a second reference for this config.

**Wallet side:** **`react-native-ble-plx`** ([dotintent](https://github.com/dotintent/react-native-ble-plx)) or the actively-maintained **[`@sfourdrinier/react-native-ble-plx`](https://github.com/sfourdrinier/react-native-ble-plx)** fork (unified `ConnectionManager` with retry/reconnect logic — useful given how often BLE drops mid-transfer). Requires `npx expo prebuild` since native modules are involved.

**Chunking protocol:** mirror **[`eddieoz/btcmesh`](https://github.com/eddieoz/btcmesh)**'s pattern (chunk → sequence → reassemble → checksum → only then validate) — same shape of problem as chunking Bitcoin raw transactions over LoRa, applied here to BLE's small ATT payloads. Frame: `[seq][total][chunk]`, CRC16 over the reassembled buffer before attempting any signature validation.

**Testing:** unchanged from before — repeated multi-KB transfers with checksum verification, deliberate mid-transfer range-walking to confirm clean failure/retry rather than silent corruption; **new**: confirm the POS-generated `posNonce` survives the round trip intact and is later checked by the backend (Phase 7) for uniqueness, not just the wallet's own EIP-3009 nonce.
**Exit Criteria:** unchanged — arbitrary JSON payloads survive full BLE round trips on real hardware, proven by repeated transfer + checksum, now explicitly including the POS's own request nonce in the payload the backend receives.

---

## Phase 5 — Offline Signing: EIP-712 Construction, Gated by Biometric/PIN
**Objective:** The wallet constructs and signs a `TransferWithAuthorization` message fully offline — now explicitly gated by the Phase 2 biometric/PIN check immediately before signing, and showing amount/payee for user confirmation first (Art. 35(18)'s MFA-at-point-of-authorization intent, applied concretely).

**Flow**
1. Wallet receives the BLE payment request `{posId, amt, reqId, posNonce, exp}`.
2. **Display amount + resolved payee identity to the user and require the biometric/PIN gate right here**, before any signing occurs — this is the actual "MFA required" moment, not just at app login.
3. Resolve `posId → payoutAddress` from the last online-cached mapping (Phase 6).
4. Construct `{from, to, value, validAfter:0, validBefore:exp, nonce:randomBytes32()}` and sign via EIP-712 typed data (`wallet.signTypedData`), using the random `bytes32` nonce — still the mechanism that removes any need for the phone to know its on-chain nonce/gas state.
5. Package `{value, signature, tokenAddress, posNonce}` for BLE transmission (Phase 4).
6. **UI must show "pending" only, never "success," until the backend pipeline (Phase 7) confirms** — this mirrors the POS's own dumb-relay rule: the wallet is equally forbidden from optimistic success states.

**Testing:** unchanged core test (sign in airplane mode, relay manually against the live contract, confirm success) **plus**: confirm the signing call is unreachable in code if the biometric/PIN gate hasn't just succeeded (test by mocking a failed/stale auth session and confirming `signTypedData` is never invoked).
**Exit Criteria:** A signature produced entirely offline settles correctly on Amoy when later relayed, **and** it is provably impossible to reach the signing code path without a fresh biometric/PIN success immediately prior.

---

## Phase 6 — Backend: Supabase Schema, Auth, RLS (Expanded for Compliance)
**Objective:** The full data model needed by every compliance service added in this revision, not just the original payments/dashboard tables.

**Core tables (original)**
- `merchants`, `pos_devices` (`pos_id`, `merchant_id`, `payout_address`, `label`, `active`), `transactions` (`id`, `pos_id`, `merchant_id`, `req_id`, `pos_nonce`, `auth_nonce`, `amount`, `token_address`, `from_address`, `status`, `tx_hash`, `created_at`, `confirmed_at`), `products`, `kb_embeddings` (`vector(768)`).

**New tables for this revision**
- `customers` — KYC identity linked to each wallet address (name, ID doc reference, risk rating), needed for sanctions screening to have something to fuzzy-match against.
- `sanctions_cache` — locally cached UN Security Council list + UAE local terrorist list entries, with a `last_synced_at` for the daily/feed-driven refresh (Phase 8).
- `fraud_rules` / `velocity_counters` — configurable thresholds (max per tap, max cumulative per wallet per day) and rolling counters per wallet (Phase 9).
- `audit_log` — append-only, one row per pipeline step per transaction attempt (Phase 10) — **RLS-enforced as insert-only, no update/delete grants to any role**, so it can't be quietly edited after the fact.
- `review_queue` — transactions held for manual compliance review (`status='pending_review'`), reviewer assignment, resolution outcome (Phase 12).
- `str_filings` — stub/record of suspicious-transaction-report filings tied to the AML obligor duty (Phase 12).
- `frozen_addresses` — mirrors the on-chain `blocklist`, plus the *reason*/*order reference* for the freeze, and whether it's a full account suspension vs. a single-transaction hold (Phase 13, Kill Switch).
- `custody_wallets` — segregation bookkeeping: which on-chain address is the customer-funds pool vs. operational/treasury, with daily reconciliation snapshots (Phase 11).

**Auth**
- Merchant dashboard login via Supabase's wallet-based (SIWE-style) auth, as before.
- **New:** a separate **compliance-officer role** (RLS policy allowing read on `audit_log`/`review_queue`/`sanctions_cache` but scoped appropriately — a compliance officer typically needs cross-merchant visibility, which is a deliberate, logged exception to the otherwise strict per-merchant RLS isolation — document this exception explicitly rather than leaving it implicit).

**Testing:** unchanged RLS adversarial tests (cross-merchant isolation) **plus**: confirm `audit_log` genuinely rejects `UPDATE`/`DELETE` at the database level (not just "the frontend doesn't expose it") for every role including the merchant's own; confirm the compliance-officer role's broader read access is itself logged when used.
**Exit Criteria:** All new tables exist with RLS policies proven adversarially, and the audit log is provably immutable at the database layer, not just by convention.

---

## Phase 7 — Backend: Synchronous Transaction Pipeline (replaces the earlier "simple relayer")
**Objective:** This is the phase that changes the most from the original plan. The relayer is no longer "receive payload → broadcast → done" — it is now a **strict, ordered, synchronous compliance pipeline**, matching the spec exactly:

```
1. Verify signature against payer's registered public key
2. Check nonce not already used (replay protection)
3. Sanctions/PEP screen payer + payee wallet (Phase 8)
4. Fraud/velocity check (Phase 9)
5. Balance check (sufficient funds in payer wallet)
6. If all pass → submit transfer to chain (transferWithAuthorization)
7. Write audit log entry (Phase 10) — before returning response
8. Return result to POS
```

**Implementation detail per step**
- **Step 1 (signature):** recover the signer from the EIP-712 payload locally (no chain call needed) and confirm it matches the payer's registered public key/address on file in `customers` — reject immediately, before touching the network, if this fails.
- **Step 2 (replay):** check **both** the EIP-3009 `auth_nonce` (via `authorizationState` — can be read cheaply from chain, or tracked in your own `transactions.auth_nonce` unique constraint as a fast pre-check) **and** the POS-generated `pos_nonce` (unique constraint in `transactions`) — the POS nonce catches request-level replay even before you'd get to a signature-level check, so check it early and cheaply.
- **Step 3 (sanctions):** synchronous call to the Phase 8 screening microservice for **both** payer and payee wallets, not just the payer — the original spec is explicit that this must be wallet-level, checked on every transaction, not only at onboarding.
- **Step 4 (fraud/velocity):** synchronous call to the Phase 9 engine.
- **Step 5 (balance):** a real balance check (on-chain read or your own ledger, whichever is authoritative in your design) before ever attempting settlement — cheap way to avoid a wasted/failed chain call.
- **Step 6 (settle):** call `transferWithAuthorization`/`receiveWithAuthorization` with the relayer's key (still living only in Edge Function secrets, never in POS firmware or the app), track `tx_hash`, poll/subscribe for confirmation.
- **Step 7 (audit, before responding):** the audit log write happens **before** step 8's response goes out — if the process crashes between settlement and logging, you must not have already told the POS "approved" — order this correctly at the code level, not just conceptually.
- **Step 8 (respond):** `approved` / `declined` / `held_for_review` back to the POS (which only now updates its display, per Phase 3's dumb-relay rule).
- **If step 3 or 4 flags anything:** do **not** hard-decline silently — route to `pending_review` (Phase 12), return `held` to the POS, and push into the compliance review queue.

**Testing:** re-run every original relayer adversarial test (duplicate-nonce replay rejected at the contract, expired authorization rejected, corrupted payload rejected before reaching chain) **plus**: a sanctions-list-matching payee halts the pipeline at step 3 and never reaches step 6; a fraud-rule-triggering transaction halts at step 4; the pipeline's step ordering is enforced by test (e.g., attempt to fake a "step 6 succeeded but step 3 was skipped" trace and confirm your code structurally cannot produce that trace, not merely that it "shouldn't happen").
**Exit Criteria:** Every transaction's path through the 8 steps is reconstructable from `audit_log` alone, in order, for both approved and held/declined outcomes — proven by replaying a batch of test transactions and cross-checking each one's audit trail against its actual outcome.

---

## Phase 8 — Sanctions/AML Screening Microservice (Art. 24 → AML Law, Travel Rule, goAML/FIU regime)
**Objective:** A standalone service so screening logic (and its eventual vendor) is never entangled with transaction code.

**Design**
- Local cache of the **UN Security Council list** + the **UAE local terrorist list**, refreshed **at least daily**, ideally via a subscribed change-feed if your list source supports one rather than a blind daily poll.
- Screening = **fuzzy name/entity matching** against the wallet-linked KYC identity in `customers`, run at:
  - **Onboarding** — before a wallet can be funded at all.
  - **Every transaction** — wallet-level, checking **both payer and payee**, not just identity-level at signup.
- Expose a minimal, boring API: `POST /screen {entity_id} → {match: bool, score, list_source}` — deliberately **not** inlined into the transaction-pipeline code, so you can swap in a commercial vendor (ComplyAdvantage, Chainalysis, etc.) later by changing only this service's internals, with zero changes to Phase 7's pipeline code.
- Note explicitly that this requirement traces to **Art. 24** of the PTSR, which incorporates the AML Law (Federal Decree-Law No. 10 of 2025 + Cabinet Resolution 134/2025) and the CBUAE Virtual Assets Travel Rule rulebook / goAML/FIU reporting regime by reference — the *real-time, ongoing* (not just onboarding) nature of the screening requirement comes from current CBUAE AML guidance rather than PTSR text itself, so treat your list-refresh cadence and matching thresholds as things that need to track evolving guidance, not a one-time implementation.

**Testing:** seed the cache with a known test "match" entity, confirm a transaction involving that entity (as either payer or payee) is caught and routed to `pending_review`; confirm a same-day list update propagates without requiring a service restart.
**Exit Criteria:** A transaction to/from a sanctioned test entity is blocked at Phase 7 step 3 and lands in the review queue — proven end-to-end, not just at the microservice's own unit-test level.

---

## Phase 9 — Fraud/Velocity Engine (Art. 35(22))
**Objective:** Deterministic, explainable rules first — this is explicitly what the spec asks for ("simple, deterministic — add ML later if you want"), and it maps directly to the PTSR's risk-based fraud-monitoring requirement.

**Rules to implement first**
- **Max transaction amount per tap** — a hard cap per single BLE payment.
- **Max cumulative amount per wallet per day** (and optionally per week) — a rolling velocity counter in `velocity_counters`, incremented on each *approved* settlement, checked before approving the next.
- Additional rules worth adding once the above are solid: transaction-count velocity (N transactions in M minutes), first-time-payee anomaly flags, geographic/device anomaly signals if you're collecting that data — explicitly deferred to "add later," per the source spec, so don't over-build this in the first pass.
- All rule thresholds live in `fraud_rules`, editable without a code deploy — a compliance officer should be able to tighten a limit without waiting on engineering.

**Testing:** transaction just under the per-tap cap → approved; just over → declined/held; a sequence of transactions that individually pass but cumulatively exceed the daily cap → the one that crosses the threshold is caught, not just the first one that individually exceeds it.
**Exit Criteria:** A scripted sequence of test transactions that should trip each rule does so exactly at the configured threshold, and the resulting transactions land in `pending_review` (per Phase 7 step 4's "flag → hold, don't silently decline" behavior), fully traceable in the audit log.

---

## Phase 10 — Audit Log Service (Art. 35(21), Art. 22(8)(a))
**Objective:** Every payment token transfer attempt — approved, declined, or held — is logged with an appropriate, tamper-evident audit trail, written **before** the pipeline responds to the POS.

**Implementation**
- `audit_log` (Phase 6) receives one row per pipeline step per transaction attempt: which step ran, its result, timestamp, and any relevant IDs (auth_nonce, pos_nonce, tx_hash once known).
- **Insert-only at the database level** — no role, including your own backend's normal operating role, has `UPDATE`/`DELETE` grants on this table; if you need to correct a record, you append a correcting entry, you never edit history.
- Consider a simple hash-chain (each row includes a hash of the previous row's content) as a cheap tamper-evidence mechanism beyond RLS alone — worth doing given this table is your primary regulator-facing evidence trail.
- This same log is what underpins **Art. 22(8)(a)'s daily reconciliation** requirement if you're acting as the token issuer (Phase 11) — the reconciliation job reads from here, not from a separately-maintained "trust me" ledger.

**Testing:** attempt an `UPDATE`/`DELETE` against `audit_log` using every role in the system, including the relayer's own service-role key — all must fail; replay a full transaction and confirm every one of the 8 pipeline steps produced exactly one log row, in order, with no gaps.
**Exit Criteria:** A complete, ordered, tamper-evident audit trail exists for 100% of transaction attempts (not just successful ones), independently reconstructable without trusting the application layer that wrote it.

---

## Phase 11 — Custody & Ledger Segregation (Art. 23(1)(2)(4); Art. 22(7); Art. 22(8)(a))
**Objective:** Customer payment tokens are held in a wallet **separate from any other virtual assets** you hold, designated and used only for that purpose, with a record of what's segregated — and if you're the token issuer, reserves are segregated per token type with daily reconciliation.

**Design**
- Maintain at least two on-chain address roles, tracked in `custody_wallets`: a **customer-funds pool** (where settled customer payments land) and a **operational/treasury wallet** (gas funding for the relayer, business operations) — these must never be the same address, and funds must not casually flow between them outside an explicit, logged operation.
- If you are the `PayToken` issuer (likely true on testnet, since you're minting it): segregate reserves per token type (Art. 22(7)) and run a **daily reconciliation job** (Art. 22(8)(a)) comparing on-chain balances against your Supabase ledger's expected totals, alerting on any mismatch rather than silently trusting the chain or the database alone.
- Record, in `custody_wallets`, an explicit statement of what's segregated and why — this is the "record kept" requirement, not just the segregation itself.

**Testing:** deliberately desync the ledger from on-chain reality in a test environment (e.g., manually edit a test DB row) and confirm the daily reconciliation job flags the mismatch; confirm no code path moves funds directly from the customer-funds pool to the operational wallet without an explicit, audit-logged transfer.
**Exit Criteria:** A daily reconciliation report exists, is itself logged, and a deliberately-introduced mismatch is caught by it within one run — not discovered manually.

---

## Phase 12 — STR / Compliance Review Queue (Art. 24 → AML Law goAML/STR regime)
**Objective:** Transactions flagged by sanctions screening (Phase 8) or fraud/velocity rules (Phase 9) don't get silently declined — they route to a human review workflow, and genuinely suspicious ones get filed as an STR, with **no minimum threshold**, triggered purely by suspicion.

**Design**
- `review_queue` entries created whenever Phase 7 step 3 or 4 flags a transaction; each entry shows the reviewer the full context (screening match details, fraud rule triggered, transaction payload, prior history for that wallet).
- Reviewer resolution options: release (settle now), decline permanently, escalate to STR filing.
- `str_filings` — a record of any filing made, tied to the AML obligor duty; for a testnet build this can be a structured internal record/stub rather than a live goAML API integration, but the **workflow and data capture** should exist now so a real filing integration is a swap-in later, not a redesign.
- Compliance-officer role (Phase 6) is the only role that can act on `review_queue`/`str_filings`.

**Testing:** a sanctions-flagged test transaction correctly lands in `review_queue` with `held` shown at the POS (per Phase 7's rule); a reviewer's "release" action correctly resumes the pipeline from step 5 (balance check) onward, not by re-running screening (already done) nor by bypassing it.
**Exit Criteria:** A held transaction is fully resolvable by a compliance officer through the dashboard's review console, with the resolution and any STR filing captured in the audit trail.

---

## Phase 13 — Kill Switch (FIU freeze/suspend powers under the 2025 AML Law)
**Objective:** The technical capability to execute an FIU freeze order **the moment it's issued** — freezing can mean a single wallet (up to 30 days) or a system-wide transaction suspension (up to 10 working days), per the AML Law's FIU powers, and you need both capabilities ready, not improvised under pressure.

**Design**
- **Per-address freeze:** an authenticated admin action that (a) sets `frozen_addresses` in Supabase, (b) calls the Phase 1 contract's freeze function so the address is blocked **on-chain**, not just at your backend — defense in depth, since a backend-only freeze can't stop funds moving if any other relay path exists.
- **System-wide suspension:** a single admin toggle that makes Phase 7's pipeline immediately return `held_for_review` (or a dedicated `suspended` status) for *every* transaction, regardless of individual screening/fraud results, until lifted — this needs to be a fast, single action, not something requiring you to individually freeze every address.
- Both actions are themselves gated by strong admin authentication (this is a highly privileged action — treat it with at least the same MFA rigor as Phase 2's customer signing gate) and are logged to `audit_log`/a dedicated `kill_switch_log` with the order reference and the acting admin identity.

**Testing:** freeze a test address, confirm both the backend pipeline **and** the on-chain contract independently reject any transaction involving it; trigger system-wide suspension, confirm every in-flight transaction attempt (including ones that would otherwise pass all screening/fraud checks) is held; confirm lifting either freeze restores normal operation without requiring a redeploy.
**Exit Criteria:** From a cold start, a single authenticated action freezes a specific address or suspends the whole system within seconds, verified at both the application and contract layer, with a complete audit trail of who ordered it and when.

---

## Phase 14 — Realtime Settlement Feed
**Objective:** Unchanged in mechanism from the original plan, now carrying the fuller state machine (`pending` → `approved`/`declined`/`held_for_review`) rather than just `received_offline → broadcast → confirmed/failed`.

**Implementation:** Supabase Realtime subscription on `transactions`, filtered by `pos_id`, streaming Postgres changes over WebSockets via logical replication. POS updates its display only on these events (per Phase 3's dumb-relay rule); wallet app reconciles its own "pending settlement" badge the same way once back online.

**Testing:** unchanged — kill/restore POS WiFi mid-flow, confirm reconnect + a one-time REST catch-up fetch covers anything missed while the socket was down.
**Exit Criteria:** unchanged — POS and (once reconnected) wallet both reflect final state within seconds, with no manual refresh, now correctly distinguishing `held_for_review` from `declined` in the UI (these must not look the same to the merchant).

---

## Phase 15 — Merchant Dashboard + Compliance Console
**Objective:** Original merchant-facing dashboard, now extended with a compliance-officer view.

**Build:** Next.js + `@supabase/supabase-js`, wallet-auth login (unchanged). Merchant views: transaction table, revenue chart, product breakdown, CSV export, live updates via Realtime — all as before, RLS-scoped.
**New — compliance console:** a separate, role-gated view (compliance-officer role from Phase 6) showing `review_queue`, `audit_log` search/browse, `frozen_addresses` management, and the kill-switch controls from Phase 13 — kept structurally and permission-wise separate from the merchant-facing views, since these two audiences must never share a login surface.

**Testing:** unchanged cross-merchant RLS test **plus**: a merchant-role user cannot reach the compliance console's routes/data even by direct URL/API manipulation.
**Exit Criteria:** A merchant sees only their own live transactions and can export a CSV; a compliance officer sees the review queue, audit log, and kill switch, and these two roles are provably non-overlapping.

---

## Phase 16 — POS Hardware: Mic + Speaker Audio Pipeline
**Objective:** Unchanged from the original plan — get record/playback working in loopback before any AI logic.

**Hardware:** INMP441 I2S mic + MAX98357A I2S amp, wired per the original pin plan (`SCK/BCK→GPIO26, WS/LRCK→GPIO25`, mic `SD→GPIO22`, amp on a separate DIN pin), **two separate I2S peripheral instances** (`I2S_NUM_0` mic RX, `I2S_NUM_1` speaker TX) to run both concurrently.

**Reference:** atomic14's ESP32 I2S audio series (record+playback-to-SD-card repo) is the most complete public reference for this exact chip pairing. **API note:** Arduino ESP32 core v3.x/ESP-IDF v5.3+ uses the new `driver/i2s_std.h` channel API — pick this or the legacy `driver/i2s.h` API and don't mix them in one sketch (a documented source of runtime conflicts). **Known INMP441 gotcha:** discard the low ~11 bits of its 32-bit frame (not a naive 16-bit shift) to avoid garbled audio; verify in Audacity before building further.

**Testing:** unchanged — record/playback loopback, check each of the documented failure modes (no sound → SD/shutdown pin; one-channel-only → floating L/R pin; garbled/pitched → sample-rate mismatch) explicitly.
**Exit Criteria:** unchanged — reliable loopback record→playback at 16kHz mono on the actual enclosure/speaker.

---

## Phase 17 — POS UX: Long-Press "0" Voice Capture & Upload
**Objective:** Unchanged from the original plan.

**Firmware:** detect `0` held for >150–200ms (to disambiguate from normal price-entry taps) → record to buffer → release finalizes a WAV → POST multipart to a backend voice-query endpoint. Show `listening…` while held, `thinking…` while awaiting response, then play the returned audio.
**Testing:** unchanged — varying hold durations, confirm normal quick taps of `0` are never misread as recording starts.
**Exit Criteria:** unchanged — a held-and-released voice clip reliably arrives intact at the backend.

---

## Phase 18 — AI Agent Backend: Gemini Audio-In + Hybrid Function-Calling/RAG
**Objective:** Unchanged core design from the original plan, with one added constraint: the voice agent must respect the **same merchant-scoping and compliance boundaries** as everything else in this system — it must never become a side channel that leaks sanctioned-entity details, another merchant's data, or frozen-account status inappropriately.

**Pipeline (unchanged mechanics)**
1. Audio sent directly to Gemini (`generateContent`/Interactions API, inline or file-uploaded audio) — no separate STT step.
2. Gemini function-calling against real Supabase RPCs for anything numeric/structured (`get_revenue`, `get_top_products`, `get_transaction_count`) — **never** let the model supply its own `merchant_id`; bind it server-side from the authenticated POS's known merchant, exactly as before.
3. `pgvector`/embeddings (Gemini's `gemini-embedding-2-preview`, truncated via MRL to 768 dims, HNSW index) used **only** for the fuzzy-matching sliver (e.g., matching a mispronounced product name) — reference: **[`thorwebdev/gemini-embeddings-2-supabase-pgvector`](https://github.com/thorwebdev/gemini-embeddings-2-supabase-pgvector)**. Structured aggregate questions ("how much did I make this week") must go through real SQL, never a vector similarity guess.
4. Automate embedding regeneration via the trigger→queue→Edge-Function pattern whenever `products`/knowledge rows change.
5. **New:** if a merchant's own account is under `pending_review` or `frozen`, the voice agent should say so plainly rather than answer as if nothing is wrong (a merchant asking "why didn't my last sale go through" deserves an honest "that transaction is under compliance review" answer, not a fabricated one) — wire this as one more function-calling tool (`get_account_status`) rather than leaving it as a gap.

**Testing:** unchanged structured/fuzzy/prompt-injection adversarial tests (exact revenue match, fuzzy product lookup, cross-merchant leak attempt blocked) **plus**: a voice query against a frozen/held account correctly surfaces that status rather than answering as if unaffected.
**Exit Criteria:** unchanged core criteria, plus: account-status-aware answers verified against a deliberately frozen test merchant.

---

## Phase 19 — AI Agent: TTS Response & POS Playback
**Objective:** Unchanged from the original plan.

**Implementation:** Gemini's native TTS (`response_format: {type:"audio"}` or `responseModalities:['AUDIO']`) generates the spoken reply directly from the function-calling loop's final answer; POS plays it back through the Phase 16 I2S speaker path. Keep answers short by prompt instruction, given the in-person POS context.
**Testing:** unchanged full-loop test (record → upload → Gemini audio-in → function-calling → TTS → playback), timed for live-conversation usability (~5s target), tested in a noisy simulated-shop environment.
**Exit Criteria:** unchanged.

---

## Phase 20 — Whole-System Security & Compliance Adversarial Testing
**Objective:** Re-attack every trust boundary across all 19 preceding phases together — the original security phase, now expanded with every compliance control added in this revision.

**Test matrix (original items, unchanged)**
- Double-spend across two POS terminals — exactly one settles, enforced by the contract's nonce mapping.
- BLE eavesdropping with/without pairing — payload unusable to a passive sniffer once encryption is enabled.
- BLE payload tampering — signature verification catches any modified `to`/`amount`.
- Compromised relayer — contract-level enforcement of nonce reuse/expiry, independent of backend correctness.
- Prompt injection via voice — merchant-scoping enforced server-side, immune to anything said in audio.
- RLS bypass attempts — cross-merchant isolation holds from both direct API calls and the dashboard UI.
- Private key never present in logs/crash reports/any Supabase table.

**New items (this revision)**
- **OTP brute force** past the configured attempt limit → server-side lockout triggers and survives client-state reset.
- **Credential-channel interception** — no plaintext password/OTP observable at any intermediate gateway hop.
- **Signing without a fresh biometric/PIN gate** — structurally unreachable, not merely discouraged.
- **Sanctions-list positive match** (payer or payee) → transaction halted at pipeline step 3, never reaches settlement, lands in review queue.
- **Fraud/velocity threshold crossing** → caught at pipeline step 4, including the "individually-fine, cumulatively-over-limit" case.
- **Audit log tamper attempt** — `UPDATE`/`DELETE` rejected at the database level for every role, including the relayer's own service role.
- **Reconciliation mismatch** (Phase 11) — a deliberately desynced ledger is caught by the daily job, not silently ignored.
- **Kill switch** — a frozen address's transaction is rejected at both the backend pipeline and the on-chain contract; a system-wide suspension holds every transaction regardless of individual screening/fraud results; both actions require strong admin auth and are fully audit-logged.
- **STR/review-queue workflow** — a flagged transaction is resolvable only by the compliance-officer role, and a merchant-role account cannot access review-queue data by any path.

**Exit Criteria:** every item above has a failing-as-designed test artifact checked into the repo (a reverted transaction hash, a rejected RLS/DB query, a denied cross-role access attempt, a lockout that survives reinstall) — not a written assurance that the design "should" prevent it.

---

## Phase 21 — Integration, Pilot & Regulatory Dry-Run
**Objective:** Put real devices, a real wallet, a real merchant dashboard, and the full compliance pipeline in front of repeated test transactions — including simulating the regulatory-facing events, not just the happy path.

**Scope**
- 50–100 real offline-BLE transactions across varying distance/interference, tallying BLE success rate, settlement latency, and any silent-failure modes (there should be none, per Phase 3/5's dumb-relay/no-optimistic-success rules).
- A scripted set of transactions deliberately engineered to trip sanctions screening, fraud/velocity rules, and the kill switch, confirming each lands correctly in the review queue or is blocked outright, with a clean audit trail for each.
- A full **STR filing dry-run**: take a flagged test transaction all the way through compliance-officer review to a recorded `str_filings` entry.
- A full **FIU freeze-order dry-run**: from "order received" to "address frozen on-chain and at the backend" to "confirmed via audit log," timed end-to-end.
- ~20 realistic voice-agent questions (structured, fuzzy, adversarial, account-status-aware), tracking accuracy.
- Daily reconciliation job run against real pilot-period data, confirming it matches actual on-chain balances.
- Battery/power check on the POS given concurrent BLE + WiFi + I2S audio draw, if portability matters for your deployment.

**Exit Criteria:** A pilot report covering transaction success rate, settlement latency distribution, voice-agent accuracy, and — new in this revision — a demonstrated, timed, audit-trailed run of both the STR-filing workflow and the FIU freeze-order workflow, with every failure mode across the whole system triaged to a specific phase/component rather than left as an unexplained anomaly.