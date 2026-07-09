// ============================================================
// Standalone QR test — keypad + OLED, no other firmware files
// ESP32-S3-N16R8 pin map
// ============================================================
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <qrcode.h>

// ---- OLED ----
#define OLED_WIDTH    128
#define OLED_HEIGHT   64
#define OLED_SDA_PIN  8
#define OLED_SCL_PIN  9
#define OLED_I2C_ADDR 0x3C
#define I2C_CLOCK_HZ  100000  // 100kHz — tolerant of long/loose jumper wires

// Match working Arduino example: fixed QR version 3 (29x29 modules, scale 2 on 128x64)
static const uint8_t QR_VERSION = 3;
static const size_t INPUT_MAX = 25;

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

// ---- Keypad ----
const uint8_t ROW_PINS[4] = {4, 5, 6, 7};
const uint8_t COL_PINS[4] = {15, 16, 17, 18};

const char KEYS[4][4] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

String enteredText = "";

static void pushBlankFrame() {
  display.clearDisplay();
  display.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT, SSD1306_BLACK);
  display.display();
}

// ---- Keypad scanning ----
void setupKeypad() {
  for (int r = 0; r < 4; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], HIGH);
  }
  for (int c = 0; c < 4; c++) {
    pinMode(COL_PINS[c], INPUT_PULLUP);
  }
}

char scanKeypad() {
  for (int r = 0; r < 4; r++) {
    digitalWrite(ROW_PINS[r], LOW);
    delayMicroseconds(50);
    for (int c = 0; c < 4; c++) {
      if (digitalRead(COL_PINS[c]) == LOW) {
        while (digitalRead(COL_PINS[c]) == LOW) delay(10);
        digitalWrite(ROW_PINS[r], HIGH);
        return KEYS[r][c];
      }
    }
    digitalWrite(ROW_PINS[r], HIGH);
  }
  return 0;
}

void showText(const String& text) {
  pushBlankFrame();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Short text only (v3 QR)");
  display.println("# = QR  * = clear");
  display.setCursor(0, 28);
  display.println(text.length() == 0 ? "(empty)" : text);
  display.display();
}

void showQrError(const char* line1, const char* line2) {
  pushBlankFrame();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(line1);
  display.println(line2);
  display.display();
}

void showQr(const String& text) {
  pushBlankFrame();

  uint8_t qrcodeData[qrcode_getBufferSize(QR_VERSION)];
  QRCode qrcode;
  if (qrcode_initText(&qrcode, qrcodeData, QR_VERSION, ECC_LOW, text.c_str()) != 0) {
    Serial.println("[QR] failed - text too long for version 3");
    showQrError("QR failed:", "use <= 25 chars");
    return;
  }

  int scale = OLED_WIDTH / qrcode.size;
  if (OLED_HEIGHT / qrcode.size < scale) {
    scale = OLED_HEIGHT / qrcode.size;
  }

  const int qrPixels = qrcode.size * scale;
  const int shiftX = (OLED_WIDTH - qrPixels) / 2;
  const int shiftY = (OLED_HEIGHT - qrPixels) / 2;

  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(shiftX + x * scale, shiftY + y * scale, scale, scale, SSD1306_WHITE);
      }
    }
  }

  display.display();
  Serial.printf("[QR] version=%u size=%ux%u scale=%d text=\"%s\"\n",
                QR_VERSION, qrcode.size, qrcode.size, scale, text.c_str());
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("QR test sketch starting...");

  setupKeypad();

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);
  Serial.printf("I2C clock %u Hz on SDA=%u SCL=%u\n", I2C_CLOCK_HZ, OLED_SDA_PIN, OLED_SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("OLED init FAILED - check wiring/address");
    while (true) delay(1000);
  }

  showText(enteredText);
  Serial.println("Ready. Type 3-4 digits (short!), # for QR, * clear.");
  Serial.println("Tip: reseat SDA/SCL wires if QR looks garbled.");
}

void loop() {
  char key = scanKeypad();
  if (key == 0) return;

  Serial.printf("Key pressed: %c\n", key);

  if (key == '#') {
    if (enteredText.length() == 0) {
      showText("(empty - type something first)");
      return;
    }
    showQr(enteredText);
  } else if (key == '*') {
    enteredText = "";
    showText(enteredText);
  } else if (key == 'A' || key == 'B' || key == 'C' || key == 'D') {
    if (enteredText.length() < INPUT_MAX) {
      enteredText += key;
      showText(enteredText);
    }
  } else {
    if (enteredText.length() < INPUT_MAX) {
      enteredText += key;
      showText(enteredText);
    }
  }
}
