/**
 * QR keypad test — standalone firmware (no BLE, no payment pipeline).
 *
 * Type on the 4x4 keypad (0-9, A-D).  * = clear.  # = show QR of entered text.
 * Matches the Adafruit SSD1306 + ricmoo QRCode approach from the working Arduino example.
 */

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <Keypad.h>
#include <Wire.h>
#include <qrcode.h>

// ESP32-S3-DevKitC-1 + SSD1306 OLED + 4x4 keypad (same wiring as main POS firmware)
static const uint8_t OLED_WIDTH = 128;
static const uint8_t OLED_HEIGHT = 64;
static const uint8_t OLED_ADDR = 0x3C;
static const uint8_t OLED_SDA = 8;
static const uint8_t OLED_SCL = 9;

static const uint8_t KEYPAD_ROW_PINS[] = {4, 5, 6, 7};
static const uint8_t KEYPAD_COL_PINS[] = {15, 16, 17, 18};
static const uint8_t KEYPAD_ROWS = 4;
static const uint8_t KEYPAD_COLS = 4;

static const size_t INPUT_MAX = 120;
static const uint8_t MIN_QR_SCALE = 2;

static char keyMap[KEYPAD_ROWS][KEYPAD_COLS] = {
    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'},
};

static Keypad keypad = Keypad(
    makeKeymap(keyMap),
    (byte*)KEYPAD_ROW_PINS,
    (byte*)KEYPAD_COL_PINS,
    KEYPAD_ROWS,
    KEYPAD_COLS);

static Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

static char inputBuf[INPUT_MAX + 1];
static size_t inputLen = 0;

static void serialBegin() {
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
  Serial.begin(115200);
  unsigned long start = millis();
  while (!Serial && (millis() - start) < 3000) {
    delay(10);
  }
#else
  Serial.begin(115200);
  delay(500);
#endif
}

static bool initDisplay() {
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[QR-TEST] SSD1306 begin() failed");
    return false;
  }
  display.clearDisplay();
  display.display();
  Serial.printf("[QR-TEST] OLED OK at 0x%02X (SDA=%u SCL=%u)\n", OLED_ADDR, OLED_SDA, OLED_SCL);
  return true;
}

static void showMessage(const char* line1, const char* line2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(line1);
  if (line2 != nullptr && line2[0] != '\0') {
    display.setCursor(0, 16);
    display.println(line2);
  }
  display.setCursor(0, 56);
  display.println("* clear   # show QR");
  display.display();
}

static void showEntryScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Enter text:");
  display.setCursor(0, 14);
  if (inputLen == 0) {
    display.println("(empty)");
  } else {
    display.println(inputBuf);
  }
  display.setCursor(0, 56);
  display.println("* clear   # show QR");
  display.display();
}

static bool drawQrCode(const char* text) {
  for (uint8_t version = 1; version <= 10; version++) {
    uint8_t qrcodeData[qrcode_getBufferSize(version)];
    QRCode qrcode;
    if (qrcode_initText(&qrcode, qrcodeData, version, ECC_LOW, text) != 0) {
      continue;
    }

    int scale = OLED_WIDTH / qrcode.size;
    if (OLED_HEIGHT / qrcode.size < scale) {
      scale = OLED_HEIGHT / qrcode.size;
    }
    if (scale < (int)MIN_QR_SCALE) {
      continue;
    }

    display.clearDisplay();
    display.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT, SSD1306_BLACK);

    const int shiftX = (OLED_WIDTH - (qrcode.size * scale)) / 2;
    const int shiftY = (OLED_HEIGHT - (qrcode.size * scale)) / 2;

    for (uint8_t y = 0; y < qrcode.size; y++) {
      for (uint8_t x = 0; x < qrcode.size; x++) {
        if (qrcode_getModule(&qrcode, x, y)) {
          display.fillRect(shiftX + (x * scale), shiftY + (y * scale), scale, scale, SSD1306_WHITE);
        }
      }
    }

    display.display();
    Serial.printf(
        "[QR-TEST] shown version=%u modules=%u scale=%d len=%u text=\"%s\"\n",
        version,
        qrcode.size,
        scale,
        (unsigned)strlen(text),
        text);
    return true;
  }

  Serial.println("[QR-TEST] QR failed - text too long for 128x64 at scale>=2");
  showMessage("QR too long", "Press * to clear");
  return false;
}

static void appendChar(char c) {
  if (inputLen >= INPUT_MAX) {
    Serial.println("[QR-TEST] input buffer full");
    return;
  }
  inputBuf[inputLen++] = c;
  inputBuf[inputLen] = '\0';
}

static void clearInput() {
  inputLen = 0;
  inputBuf[0] = '\0';
  showEntryScreen();
  Serial.println("[QR-TEST] cleared");
}

static void onConfirm() {
  if (inputLen == 0) {
    showMessage("Nothing entered", "Type then press #");
    Serial.println("[QR-TEST] confirm with empty input");
    return;
  }
  drawQrCode(inputBuf);
}

static void handleKey(char key) {
  Serial.printf("[QR-TEST] key '%c'\n", key);

  if (key == '#') {
    onConfirm();
    return;
  }
  if (key == '*') {
    clearInput();
    return;
  }
  if ((key >= '0' && key <= '9') || (key >= 'A' && key <= 'D')) {
    appendChar(key);
    showEntryScreen();
    return;
  }
}

void setup() {
  serialBegin();
  Serial.println();
  Serial.println("=== Moo QR keypad test ===");
  Serial.println("Type digits/letters, * clear, # show QR");

  if (!initDisplay()) {
    Serial.println("[QR-TEST] HALT - fix OLED wiring");
    while (true) {
      delay(1000);
    }
  }

  Serial.print("[QR-TEST] keypad rows ");
  for (uint8_t i = 0; i < KEYPAD_ROWS; i++) {
    Serial.print(KEYPAD_ROW_PINS[i]);
    if (i + 1 < KEYPAD_ROWS) Serial.print(",");
  }
  Serial.print(" cols ");
  for (uint8_t i = 0; i < KEYPAD_COLS; i++) {
    Serial.print(KEYPAD_COL_PINS[i]);
    if (i + 1 < KEYPAD_COLS) Serial.print(",");
  }
  Serial.println();

  showEntryScreen();
}

void loop() {
  char key = keypad.getKey();
  if (key != NO_KEY) {
    handleKey(key);
  }
}
