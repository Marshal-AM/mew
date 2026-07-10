#pragma once

#include <stdint.h>

#ifndef POS_ID
#define POS_ID "POS-001"
#endif

#ifndef PAYMENT_TTL_SEC
#define PAYMENT_TTL_SEC 300
#endif

#ifndef POS_PAYOUT_ADDRESS
#define POS_PAYOUT_ADDRESS ""
#endif

#ifndef BOOT_EPOCH
#define BOOT_EPOCH 1700000000UL
#endif

#define MAX_AMOUNT_CENTS 99999999UL
#define MAX_DIGIT_KEYS 8
#define LONG_PRESS_MS 200
#define PAYMENT_JSON_MAX 192

#if defined(DISPLAY_OLED) && defined(DISPLAY_TFT)
#error "Only one of DISPLAY_OLED or DISPLAY_TFT may be defined"
#endif

#if !defined(DISPLAY_OLED) && !defined(DISPLAY_TFT)
#error "Define DISPLAY_OLED or DISPLAY_TFT"
#endif

#if defined(BOARD_ESP32_S3) && defined(DISPLAY_OLED)

// ESP32-S3-DevKitC-1 (N16R8): GPIO 22 is not broken out on the header.
static const char* const PIN_PROFILE_NAME = "esp32-s3-oled";

static const uint8_t KEYPAD_ROW_PINS[] = {4, 5, 6, 7};
static const uint8_t KEYPAD_COL_PINS[] = {15, 16, 17, 18};
static const uint8_t KEYPAD_ROWS = 4;
static const uint8_t KEYPAD_COLS = 4;

#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_I2C_ADDR 0x3C
#define OLED_SDA_PIN 8
#define OLED_SCL_PIN 9

#if defined(AUDIO_ENABLE)
#define AUDIO_SAMPLE_RATE_HZ 16000
// Avoid GPIO 3 (ESP32-S3 strapping pin) — use 13/14/21 instead of 1/2/3.
#define I2S_MIC_BCLK_PIN 13
#define I2S_MIC_WS_PIN 14
#define I2S_MIC_SD_PIN 21
#define I2S_SPK_BCLK_PIN 10
#define I2S_SPK_WS_PIN 11
#define I2S_SPK_DIN_PIN 12
#define AUDIO_LOOPBACK_DEFAULT_SEC 2
#define AUDIO_LOOPBACK_CHUNK_SAMPLES 512
#define AUDIO_MIC_SIGNAL_PEAK_THRESHOLD 400
#define AUDIO_MIC_STATUS_LOG_INTERVAL_MS 5000
// INMP441 on this board delivers audio on the I2S RIGHT slot (deep_diag verified).
#define AUDIO_MIC_PCM_SHIFT 14
// Boost monitor/playback so speech is audible on the MAX98357A.
#define AUDIO_MONITOR_GAIN 4
#define AUDIO_VOICE_RECORD_MAX_SEC 4
#define AUDIO_VOICE_MAX_SAMPLES (AUDIO_SAMPLE_RATE_HZ * AUDIO_VOICE_RECORD_MAX_SEC)
#define AUDIO_VOICE_LOG_INTERVAL_MS 1000
#endif

#elif defined(DISPLAY_OLED)

// Classic ESP32 DevKit
static const char* const PIN_PROFILE_NAME = "esp32-oled";

static const uint8_t KEYPAD_ROW_PINS[] = {19, 18, 5, 17};
static const uint8_t KEYPAD_COL_PINS[] = {16, 14, 27, 26};
static const uint8_t KEYPAD_ROWS = 4;
static const uint8_t KEYPAD_COLS = 4;

#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_I2C_ADDR 0x3C
#define OLED_SDA_PIN 21
#define OLED_SCL_PIN 22

#elif defined(BOARD_ESP32_S3) && defined(DISPLAY_TFT)

static const char* const PIN_PROFILE_NAME = "esp32-s3-tft";

static const uint8_t KEYPAD_ROW_PINS[] = {4, 5, 6, 7};
static const uint8_t KEYPAD_COL_PINS[] = {15, 16, 17, 18};
static const uint8_t KEYPAD_ROWS = 4;
static const uint8_t KEYPAD_COLS = 4;

#elif defined(DISPLAY_TFT)

static const char* const PIN_PROFILE_NAME = "esp32-tft";

static const uint8_t KEYPAD_ROW_PINS[] = {32, 33, 25, 26};
static const uint8_t KEYPAD_COL_PINS[] = {27, 35, 34, 39};
static const uint8_t KEYPAD_ROWS = 4;
static const uint8_t KEYPAD_COLS = 4;

#endif
