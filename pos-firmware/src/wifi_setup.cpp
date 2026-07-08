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

void wifiSetupInit() {
  if (strlen(WIFI_SSID) == 0) {
    Serial.println("[WiFi] not configured (set WIFI_SSID in platformio.ini)");
    configured = false;
    return;
  }

  configured = true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
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
    Serial.print("[WiFi] connected, IP=");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] initial connect failed");
  }
}

void wifiLoop() {
  if (!configured) {
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    connected = true;
    return;
  }

  connected = false;
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
