#include "display.h"

#include "config.h"
#include "payment_request.h"

#include <Arduino.h>
#include <stdio.h>

#if defined(DISPLAY_OLED)

#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Wire.h>
#include <qrcode.h>

static Adafruit_SH1106G* oled = nullptr;
static bool ready = false;
static const uint32_t OLED_I2C_CLOCK_HZ = 100000;

static bool probeI2cAddress(uint8_t sda, uint8_t scl, uint8_t addr) {
  Wire.begin(sda, scl);
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

static bool discoverOled(uint8_t* sdaOut, uint8_t* sclOut, uint8_t* addrOut) {
#if defined(BOARD_ESP32_S3)
  static const uint8_t pairs[][2] = {
      {OLED_SDA_PIN, OLED_SCL_PIN},
      {8, 9},
      {21, 20},
      {10, 11},
      {12, 13},
  };
#else
  static const uint8_t pairs[][2] = {{OLED_SDA_PIN, OLED_SCL_PIN}};
#endif
  static const uint8_t addrs[] = {0x3C, 0x3D};

  for (size_t i = 0; i < sizeof(pairs) / sizeof(pairs[0]); i++) {
    for (size_t j = 0; j < sizeof(addrs); j++) {
      if (probeI2cAddress(pairs[i][0], pairs[i][1], addrs[j])) {
        *sdaOut = pairs[i][0];
        *sclOut = pairs[i][1];
        *addrOut = addrs[j];
        return true;
      }
    }
  }
  return false;
}

static void scanAndLogI2c() {
#if defined(BOARD_ESP32_S3)
  static const uint8_t pairs[][2] = {{8, 9}, {21, 20}, {10, 11}, {12, 13}, {OLED_SDA_PIN, OLED_SCL_PIN}};
#else
  static const uint8_t pairs[][2] = {{OLED_SDA_PIN, OLED_SCL_PIN}};
#endif

  Serial.println("[DISPLAY] I2C scan:");
  for (size_t i = 0; i < sizeof(pairs) / sizeof(pairs[0]); i++) {
    Wire.begin(pairs[i][0], pairs[i][1]);
    Serial.printf("  SDA=%u SCL=%u:", pairs[i][0], pairs[i][1]);
    bool any = false;
    for (uint8_t addr = 1; addr < 127; addr++) {
      Wire.beginTransmission(addr);
      if (Wire.endTransmission() == 0) {
        Serial.printf(" 0x%02X", addr);
        any = true;
      }
    }
    if (!any) {
      Serial.print(" (none)");
    }
    Serial.println();
  }
}

static void formatCents(uint32_t cents, char* out, size_t outLen) {
  char amount[16];
  formatAmount(cents, amount, sizeof(amount));
  snprintf(out, outLen, "$%s", amount);
}

static void drawCenteredText(Adafruit_SH1106G& display, const char* text, int16_t y, uint8_t textSize) {
  display.setTextSize(textSize);
  display.setTextColor(SH110X_WHITE);
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t w = 0;
  uint16_t h = 0;
  display.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
  display.setCursor((OLED_WIDTH - (int16_t)w) / 2, y);
  display.println(text);
}

static void clearOledFrame(Adafruit_SH1106G& display) {
  display.clearDisplay();
  display.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT, SH110X_BLACK);
  display.display();
}

static bool drawQrCodeInRegion(
    Adafruit_SH1106G& display,
    const char* text,
    int16_t regionX,
    int16_t regionY,
    int16_t regionW,
    int16_t regionH) {
  // Use the same QR library/rendering approach as the known-good qrtest2 sketch.
  const uint8_t version = 3;
  uint8_t qrcodeData[qrcode_getBufferSize(version)];
  QRCode qrcode;
  int8_t ok = qrcode_initText(&qrcode, qrcodeData, version, ECC_LOW, text);
  if (ok != 0) {
    Serial.printf("[DISPLAY] QR encode failed version=%u err=%d\n", version, ok);
    return false;
  }

  const int moduleCount = qrcode.size;
  int scale = regionW / moduleCount;
  if (regionH / moduleCount < scale) {
    scale = regionH / moduleCount;
  }
  if (scale < 1) {
    Serial.printf("[DISPLAY] QR scale invalid modules=%d scale=%d\n", moduleCount, scale);
    return false;
  }

  const int qrPixels = moduleCount * scale;
  const int shiftX = regionX + (regionW - qrPixels) / 2;
  const int shiftY = regionY + (regionH - qrPixels) / 2;

  for (int y = 0; y < moduleCount; y++) {
    for (int x = 0; x < moduleCount; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(
            shiftX + (x * scale),
            shiftY + (y * scale),
            scale,
            scale,
            SH110X_WHITE);
      }
    }
  }

  Serial.printf(
      "[DISPLAY] QR ricmoo version=%u modules=%d scale=%d region=%dx%d@%d,%d\n",
      version,
      moduleCount,
      scale,
      regionW,
      regionH,
      regionX,
      regionY);
  return true;
}

static bool drawQrPaymentScreen(Adafruit_SH1106G& display, const char* json, uint32_t cents) {
  (void)cents;

  clearOledFrame(display);

  if (!drawQrCodeInRegion(display, json, 0, 0, OLED_WIDTH, OLED_HEIGHT)) {
    return false;
  }

  display.display();
  return true;
}

bool displayInit() {
  scanAndLogI2c();

  uint8_t sda = OLED_SDA_PIN;
  uint8_t scl = OLED_SCL_PIN;
  uint8_t addr = OLED_I2C_ADDR;

  if (!discoverOled(&sda, &scl, &addr)) {
    Serial.println("[DISPLAY] OLED not found — check SDA/SCL wiring and 3.3V power");
    return false;
  }

  Serial.printf("[DISPLAY] Using OLED 0x%02X on SDA=%u SCL=%u\n", addr, sda, scl);

  Wire.begin(sda, scl);
  Wire.setClock(OLED_I2C_CLOCK_HZ);
  oled = new Adafruit_SH1106G(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
  if (!oled->begin(addr, true)) {
    Serial.println("[DISPLAY] Adafruit SH1106 begin() failed");
    delete oled;
    oled = nullptr;
    return false;
  }

  oled->setRotation(0);
  oled->clearDisplay();
  oled->display();
  Serial.printf("[DISPLAY] SH1106 ready at %lu Hz\n", (unsigned long)OLED_I2C_CLOCK_HZ);
  ready = true;
  return true;
}

bool displayIsReady() {
  return ready;
}

void showEntryScreen(uint32_t cents) {
  if (!ready || oled == nullptr) {
    return;
  }

  char line[20];
  formatCents(cents, line, sizeof(line));

  oled->clearDisplay();
  drawCenteredText(*oled, "Enter amount", 0, 1);
  drawCenteredText(*oled, line, 24, 2);
  drawCenteredText(*oled, "# confirm  * clear", 56, 1);
  oled->display();
}

void showQrScreen(const char* json, uint32_t cents) {
  if (!ready || oled == nullptr) {
    return;
  }

  Serial.printf("[DISPLAY] Rendering QR payload len=%u\n", (unsigned)strlen(json));
  Serial.print("[DISPLAY] QR payload: ");
  Serial.println(json);

  if (!drawQrPaymentScreen(*oled, json, cents)) {
    showError("QR failed");
  }
}

void showError(const char* msg) {
  if (!ready || oled == nullptr) {
    return;
  }

  oled->clearDisplay();
  drawCenteredText(*oled, msg, 20, 1);
  oled->display();
}

static void formatCentsLine(uint32_t cents, char* line, size_t lineLen) {
  formatCents(cents, line, lineLen);
}

void showPendingScreen(uint32_t cents) {
  if (!ready || oled == nullptr) return;
  char line[20];
  formatCentsLine(cents, line, sizeof(line));
  oled->clearDisplay();
  drawCenteredText(*oled, "Processing...", 8, 1);
  drawCenteredText(*oled, line, 28, 1);
  drawCenteredText(*oled, "Awaiting backend", 48, 1);
  oled->display();
}

void showApprovedScreen(uint32_t cents) {
  if (!ready || oled == nullptr) return;
  char line[20];
  formatCentsLine(cents, line, sizeof(line));
  oled->clearDisplay();
  drawCenteredText(*oled, "APPROVED", 8, 1);
  drawCenteredText(*oled, line, 32, 1);
  drawCenteredText(*oled, "* new sale", 52, 1);
  oled->display();
}

void showDeclinedScreen(const char* reason) {
  if (!ready || oled == nullptr) return;
  oled->clearDisplay();
  drawCenteredText(*oled, "DECLINED", 4, 1);
  drawCenteredText(*oled, reason ? reason : "Payment declined", 28, 1);
  drawCenteredText(*oled, "* new sale", 52, 1);
  oled->display();
}

void showHeldScreen(const char* reason) {
  if (!ready || oled == nullptr) return;
  oled->clearDisplay();
  drawCenteredText(*oled, "HELD", 4, 1);
  drawCenteredText(*oled, reason ? reason : "Review required", 28, 1);
  drawCenteredText(*oled, "* new sale", 52, 1);
  oled->display();
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
