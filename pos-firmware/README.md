# Moo POS Firmware (Phase 7)

ESP32 POS firmware: keypad price entry, payment-request JSON + QR, NimBLE signed-payment receive, WiFi relay to the backend pipeline, and settlement UI (Pending / Approved / Declined / Held).

See also [`docs/ble-protocol.md`](../docs/ble-protocol.md).

## Hardware

- **MCU:** ESP32 DevKit (`esp32dev`)
- **Keypad:** 4×4 matrix (`0–9`, `#` confirm, `*` clear)
- **Display:** SSD1306 OLED (128×64 I2C) **or** ILI9341 TFT (240×320 SPI)

Pick the PlatformIO environment that matches your display wiring.

## Pin maps

### OLED build (`esp32-oled`)

| Subsystem | GPIO |
|-----------|------|
| Keypad rows | 19, 18, 5, 17 |
| Keypad cols | 16, 14, 27, 26 |
| OLED SDA | 21 |
| OLED SCL | 22 |
| OLED I2C addr | 0x3C |

### TFT build (`esp32-tft`)

| Subsystem | GPIO |
|-----------|------|
| Keypad rows | 32, 33, 25, 26 |
| Keypad cols | 27, 35, 34, 39 |
| TFT MOSI | 13 |
| TFT SCLK | 14 |
| TFT CS | 15 |
| TFT DC | 2 |
| TFT RST | 4 |

Edit [`include/config.h`](include/config.h) if your wiring differs.

**Avoid:** GPIO 6–11 (flash). GPIO 2 is a boot-strapping pin on some boards — if the TFT build boot-loops, move `TFT_DC` to another pin in `platformio.ini` and `config.h`.

## Build & flash

Requires [PlatformIO](https://platformio.org/).

```bash
cd pos-firmware

# OLED (default)
pio run -e esp32-oled
pio run -e esp32-oled -t upload

# TFT
pio run -e esp32-tft
pio run -e esp32-tft -t upload

# Serial monitor (115200 baud)
pio device monitor
```

On Windows without global PlatformIO, use the project venv:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install platformio
.\.venv\Scripts\python.exe -m platformio run -e esp32-oled -e esp32-tft
```

## Configuration

| Setting | Default | Where |
|---------|---------|-------|
| `POS_ID` | `POS-001` | `platformio.ini` build flag or `config.h` |
| `PAYMENT_TTL_SEC` | 300 | `platformio.ini` |
| QR version | 5 | `platformio.ini` (`QRCODEVERSION`) |
| `WIFI_SSID` | *(empty)* | `platformio.ini` — required for Phase 7 relay |
| `WIFI_PASSWORD` | *(empty)* | `platformio.ini` |
| `SUBMIT_URL` | *(empty)* | Supabase `.../functions/v1/submit-transaction` |
| `SUPABASE_ANON_KEY` | *(empty)* | Supabase project anon key |

Example `platformio.ini` overrides for a live device:

```ini
-D WIFI_SSID=\"MyNetwork\"
-D WIFI_PASSWORD=\"secret\"
-D SUBMIT_URL=\"https://YOUR_PROJECT.supabase.co/functions/v1/submit-transaction\"
-D SUPABASE_ANON_KEY=\"eyJ...\"
```

## Usage

1. Power on — serial shows pin profile and `POS_ID`.
2. Enter amount digit-by-digit (cents accumulator): `5` `0` `0` → `$5.00`.
3. Press `#` — QR appears; serial logs `[PAYMENT_REQUEST] {...}`.
4. Scan QR with any phone scanner — JSON should parse cleanly.
5. Press `*` — start a new sale.

### Payment request JSON

```json
{"posId":"POS-001","amt":"5.00","reqId":"a1b2c3","posNonce":"<32 hex chars>","exp":1700000300}
```

- `reqId` — 6 hex chars, unique per request
- `posNonce` — 32 hex chars, POS-side replay anchor (Phase 7 backend checks this)
- `exp` — Unix expiry from NTP (`pool.ntp.org`) with boot-epoch fallback

Long-press `0` is detected and logged (reserved for voice in Phase 16); short tap enters `0`.

## BLE (Phase 4)

- **Library:** NimBLE-Arduino GATT server
- **Advertise name:** `Moo-{POS_ID}` (default `Moo-POS-001`)
- **Service UUID:** `6d6f6f01-0000-4000-8000-000000000001`
- **Dev passkey:** `123456` (pair when wallet connects)
- Wallet writes chunked frames to the write characteristic; POS notifies chunk acks + echoes payload back

### BLE + wallet + backend test (Phase 7)

1. Configure WiFi + `SUBMIT_URL` in `platformio.ini`, deploy `submit-transaction` Edge Function (see root README).
2. Flash POS firmware and open serial monitor.
3. Enter amount, press `#` — QR appears.
4. On wallet **Pay** tab: sync POS registry, scan QR, confirm, authorize with biometric/PIN.
5. POS shows **Processing…** then **APPROVED** / **DECLINED** / **HELD** from backend response.
6. Wallet **History** tab syncs confirmed status + `tx_hash` when online.

## Test checklist

1. Type `5` `0` `0` → screen shows `$5.00`
2. Press `#` → QR renders
3. Scan QR → JSON matches serial `[PAYMENT_REQUEST]` line
4. Press `*` → back to amount entry
5. Generate 20+ requests → all `reqId` / `posNonce` values differ

## Project layout

```
include/     Headers (config, display, keypad, payment, UI, wifi, relay)
src/         Implementation
platformio.ini   Dual env: esp32-oled, esp32-tft
```

Settlement UI drives **Pending → Approved / Declined / Held** from the synchronous backend pipeline response (Phase 7).
