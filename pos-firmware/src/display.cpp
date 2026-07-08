#include "display.h"

#include "config.h"
#include "payment_request.h"

#include <Arduino.h>
#include <stdio.h>

#if defined(DISPLAY_OLED)

#include <SSD1306.h>
#include <qrcodeoled.h>

static SSD1306 oled(OLED_I2C_ADDR, OLED_SDA_PIN, OLED_SCL_PIN);
static QRcodeOled qrcode(&oled);
static bool ready = false;

static void formatCents(uint32_t cents, char* out, size_t outLen) {
  char amount[16];
  formatAmount(cents, amount, sizeof(amount));
  snprintf(out, outLen, "$%s", amount);
}

bool displayInit() {
  oled.init();
  oled.flipScreenVertically();
  oled.clear();
  oled.display();
  qrcode.init();
  ready = true;
  return true;
}

bool displayIsReady() {
  return ready;
}

void showEntryScreen(uint32_t cents) {
  if (!ready) {
    return;
  }

  char line[20];
  formatCents(cents, line, sizeof(line));

  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_CENTER);
  oled.setFont(ArialMT_Plain_16);
  oled.drawString(64, 0, "Enter amount");
  oled.setFont(ArialMT_Plain_24);
  oled.drawString(64, 24, line);
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(64, 56, "# confirm  * clear");
  oled.display();
}

void showQrScreen(const char* json, uint32_t cents) {
  if (!ready) {
    return;
  }

  char line[20];
  formatCents(cents, line, sizeof(line));

  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_LEFT);
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(0, 0, line);
  oled.drawString(0, 10, "Scan to pay");
  oled.display();

  qrcode.create(json);
}

void showError(const char* msg) {
  if (!ready) {
    return;
  }

  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_CENTER);
  oled.setFont(ArialMT_Plain_16);
  oled.drawString(64, 20, msg);
  oled.display();
}

static void formatCentsLine(uint32_t cents, char* line, size_t lineLen) {
  formatCents(cents, line, lineLen);
}

void showPendingScreen(uint32_t cents) {
  if (!ready) return;
  char line[20];
  formatCentsLine(cents, line, sizeof(line));
  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_CENTER);
  oled.setFont(ArialMT_Plain_16);
  oled.drawString(64, 8, "Processing...");
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(64, 28, line);
  oled.drawString(64, 48, "Awaiting backend");
  oled.display();
}

void showApprovedScreen(uint32_t cents) {
  if (!ready) return;
  char line[20];
  formatCentsLine(cents, line, sizeof(line));
  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_CENTER);
  oled.setFont(ArialMT_Plain_16);
  oled.drawString(64, 8, "APPROVED");
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(64, 32, line);
  oled.drawString(64, 52, "* new sale");
  oled.display();
}

void showDeclinedScreen(const char* reason) {
  if (!ready) return;
  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_CENTER);
  oled.setFont(ArialMT_Plain_16);
  oled.drawString(64, 4, "DECLINED");
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(64, 28, reason ? reason : "Payment declined");
  oled.drawString(64, 52, "* new sale");
  oled.display();
}

void showHeldScreen(const char* reason) {
  if (!ready) return;
  oled.clear();
  oled.setTextAlignment(TEXT_ALIGN_CENTER);
  oled.setFont(ArialMT_Plain_16);
  oled.drawString(64, 4, "HELD");
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(64, 28, reason ? reason : "Review required");
  oled.drawString(64, 52, "* new sale");
  oled.display();
}

#elif defined(DISPLAY_TFT)

#include <TFT_eSPI.h>
#include <qrcode_espi.h>

static TFT_eSPI tft = TFT_eSPI();
static QRcode_eSPI qrcode(&tft);
static bool ready = false;

static void formatCents(uint32_t cents, char* out, size_t outLen) {
  char amount[16];
  formatAmount(cents, amount, sizeof(amount));
  snprintf(out, outLen, "$%s", amount);
}

bool displayInit() {
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
  qrcode.init();
  ready = true;
  return true;
}

bool displayIsReady() {
  return ready;
}

void showEntryScreen(uint32_t cents) {
  if (!ready) {
    return;
  }

  char line[20];
  formatCents(cents, line, sizeof(line));

  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("Enter amount", tft.width() / 2, 10, 2);
  tft.drawString(line, tft.width() / 2, 60, 4);
  tft.drawString("# confirm  * clear", tft.width() / 2, tft.height() - 20, 1);
}

void showQrScreen(const char* json, uint32_t cents) {
  if (!ready) {
    return;
  }

  char line[24];
  formatCents(cents, line, sizeof(line));

  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(TL_DATUM);
  tft.drawString(line, 8, 8, 2);
  tft.drawString("Scan to pay", 8, 32, 1);

  qrcode.create(json);
}

void showError(const char* msg) {
  if (!ready) {
    return;
  }

  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_RED, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(msg, tft.width() / 2, tft.height() / 2, 2);
}

static void formatCentsLine(uint32_t cents, char* line, size_t lineLen) {
  char amount[16];
  formatAmount(cents, amount, sizeof(amount));
  snprintf(line, lineLen, "$%s", amount);
}

void showPendingScreen(uint32_t cents) {
  if (!ready) return;
  char line[24];
  formatCentsLine(cents, line, sizeof(line));
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("Processing...", tft.width() / 2, 20, 2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(line, tft.width() / 2, 60, 2);
  tft.drawString("Awaiting backend", tft.width() / 2, 100, 1);
}

void showApprovedScreen(uint32_t cents) {
  if (!ready) return;
  char line[24];
  formatCentsLine(cents, line, sizeof(line));
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("APPROVED", tft.width() / 2, 30, 4);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(line, tft.width() / 2, 90, 2);
  tft.drawString("* new sale", tft.width() / 2, tft.height() - 20, 1);
}

void showDeclinedScreen(const char* reason) {
  if (!ready) return;
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_RED, TFT_BLACK);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("DECLINED", tft.width() / 2, 30, 4);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(reason ? reason : "Payment declined", tft.width() / 2, 90, 1);
  tft.drawString("* new sale", tft.width() / 2, tft.height() - 20, 1);
}

void showHeldScreen(const char* reason) {
  if (!ready) return;
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_ORANGE, TFT_BLACK);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("HELD", tft.width() / 2, 30, 4);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(reason ? reason : "Review required", tft.width() / 2, 90, 1);
  tft.drawString("* new sale", tft.width() / 2, tft.height() - 20, 1);
}

#endif
