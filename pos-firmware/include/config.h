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
