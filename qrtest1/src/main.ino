// ============================================================
// Minimal hardcoded QR test — no keypad, fixed text, fixed version.
// Mirrors the known-working Hackster example to isolate whether
// this is a code issue or a wiring/I2C issue.
// ============================================================
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <qrcode.h>

#define OLED_WIDTH    128
#define OLED_HEIGHT   64
#define OLED_SDA_PIN  8
#define OLED_SCL_PIN  9
#define OLED_I2C_ADDR 0x3C

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

const char* TEST_TEXT = "hello";

void setup() {
  Serial.begin(115200);
  delay(300);

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  Wire.setClock(100000);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("OLED init FAILED");
    while (true) delay(1000);
  }
  Serial.println("OLED init OK");

  display.clearDisplay();
  display.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT, SSD1306_WHITE);
  display.display();
  Serial.println("Showing solid white fill for 2s...");
  delay(2000);

  display.clearDisplay();
  for (int y = 0; y < OLED_HEIGHT; y += 8) {
    for (int x = 0; x < OLED_WIDTH; x += 8) {
      if (((x / 8) + (y / 8)) % 2 == 0) {
        display.fillRect(x, y, 8, 8, SSD1306_WHITE);
      }
    }
  }
  display.display();
  Serial.println("Showing checkerboard for 3s...");
  delay(3000);

  display.clearDisplay();

  const uint8_t version = 3;
  uint8_t qrcodeData[qrcode_getBufferSize(version)];
  QRCode qrcode;
  int8_t ok = qrcode_initText(&qrcode, qrcodeData, version, ECC_LOW, TEST_TEXT);

  if (ok != 0) {
    Serial.println("qrcode_initText failed");
    display.setCursor(0, 0);
    display.println("init failed");
    display.display();
    return;
  }

  int scale = OLED_WIDTH / qrcode.size;
  if (OLED_HEIGHT / qrcode.size < scale) scale = OLED_HEIGHT / qrcode.size;
  int qrPixels = qrcode.size * scale;
  int shiftX = (OLED_WIDTH - qrPixels) / 2;
  int shiftY = (OLED_HEIGHT - qrPixels) / 2;

  Serial.printf("QR size=%ux%u scale=%dpx qrPixels=%d\n", qrcode.size, qrcode.size, scale, qrPixels);

  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(shiftX + x * scale, shiftY + y * scale, scale, scale, SSD1306_WHITE);
      }
    }
  }
  display.display();
  Serial.println("QR drawn. Done.");
}

void loop() {
}
