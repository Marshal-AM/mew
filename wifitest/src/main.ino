#include <WiFi.h>

#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

static const unsigned long WIFI_TIMEOUT_MS = 15000;
static unsigned long lastStatusMs = 0;

void setup() {
  Serial.begin(115200);
#if defined(ARDUINO_USB_CDC_ON_BOOT)
  unsigned long serialWaitStart = millis();
  while (!Serial && millis() - serialWaitStart < 4000) {
    delay(10);
  }
#endif

  delay(300);
  Serial.println();
  Serial.println("ESP32-S3 WiFi smoke test");
  Serial.printf("SSID: %s\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");

    if (millis() - start > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("Failed to connect - check SSID/password/signal");
      Serial.printf("Final WiFi.status() = %d\n", WiFi.status());
      return;
    }
  }

  Serial.println();
  Serial.println("Connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Signal strength (RSSI): ");
  Serial.println(WiFi.RSSI());
}

void loop() {
  if (millis() - lastStatusMs >= 5000) {
    lastStatusMs = millis();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("WiFi OK - IP: ");
      Serial.print(WiFi.localIP());
      Serial.print(" RSSI: ");
      Serial.println(WiFi.RSSI());
    } else {
      Serial.print("WiFi disconnected! status=");
      Serial.println(WiFi.status());
    }
  }
}
