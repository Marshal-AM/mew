# Moo

Offline BLE → Polygon POS payment system. A mobile wallet signs EIP-3009 `transferWithAuthorization` messages offline, transmits them to an ESP32 POS over BLE, and a backend relayer settles on Polygon Amoy.

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

**Features:** create/import wallet (BIP-39), mnemonic in `expo-secure-store`, live Amoy balances (POL + MOO), receive QR, sign test, logout.

```bash
npm run typecheck
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

```bash
cd pos-firmware
pio run
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
