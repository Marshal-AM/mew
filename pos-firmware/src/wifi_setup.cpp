#include "wifi_setup.h"

#include "config.h"

#include <Arduino.h>
#include <WiFi.h>

#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

static bool configured = false;
static bool connected = false;
static unsigned long lastReconnectMs = 0;
static unsigned long lastStatusLogMs = 0;

static void logWifiConnected(const char* prefix) {
  Serial.print(prefix);
  Serial.print("IP=");
  Serial.print(WiFi.localIP());
  Serial.print(" RSSI=");
  Serial.println(WiFi.RSSI());
}

void wifiSetupInit() {
  if (strlen(WIFI_SSID) == 0) {
    Serial.println("[WiFi] not configured (set WIFI_SSID in platformio.ini)");
    configured = false;
    return;
  }

  configured = true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("[WiFi] ESP32-S3 WiFi smoke test");
  Serial.print("[WiFi] connecting to ");
  Serial.println(WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    connected = true;
    logWifiConnected("[WiFi] connected! ");
  } else {
    Serial.println("[WiFi] initial connect failed");
    Serial.print("[WiFi] final status=");
    Serial.println(WiFi.status());
  }
}

void wifiLoop() {
  if (!configured) {
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    connected = true;
    if (millis() - lastStatusLogMs >= 5000) {
      lastStatusLogMs = millis();
      logWifiConnected("[WiFi] OK - ");
    }
    return;
  }

  connected = false;
  if (millis() - lastStatusLogMs >= 5000) {
    lastStatusLogMs = millis();
    Serial.print("[WiFi] disconnected! status=");
    Serial.println(WiFi.status());
  }
  if (millis() - lastReconnectMs < 5000) {
    return;
  }
  lastReconnectMs = millis();
  Serial.println("[WiFi] reconnecting...");
  WiFi.reconnect();
}

bool wifiIsConnected() {
  return configured && WiFi.status() == WL_CONNECTED;
}
