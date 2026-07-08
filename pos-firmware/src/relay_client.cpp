#include "relay_client.h"

#include "config.h"
#include "wifi_setup.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

#ifndef SUBMIT_URL
#define SUBMIT_URL ""
#endif

#ifndef SUPABASE_ANON_KEY
#define SUPABASE_ANON_KEY ""
#endif

static RelayResult parseStatus(const char* status, char* reasonOut, size_t reasonLen, const JsonDocument& doc) {
  if (strcmp(status, "approved") == 0) {
    return RELAY_APPROVED;
  }
  if (strcmp(status, "held") == 0) {
    if (reasonOut && reasonLen > 0) {
      const char* reason = doc["reason"] | "Held for review";
      strncpy(reasonOut, reason, reasonLen - 1);
      reasonOut[reasonLen - 1] = '\0';
    }
    return RELAY_HELD;
  }
  if (reasonOut && reasonLen > 0) {
    const char* reason = doc["reason"] | doc["error"] | "Declined";
    strncpy(reasonOut, reason, reasonLen - 1);
    reasonOut[reasonLen - 1] = '\0';
  }
  return RELAY_DECLINED;
}

RelayResult relaySubmitPayment(const char* signedJson, char* reasonOut, size_t reasonLen) {
  if (reasonOut && reasonLen > 0) {
    reasonOut[0] = '\0';
  }

  if (strlen(SUBMIT_URL) == 0 || strlen(SUPABASE_ANON_KEY) == 0) {
    if (reasonOut && reasonLen > 0) {
      strncpy(reasonOut, "Relay not configured", reasonLen - 1);
    }
    return RELAY_ERROR;
  }

  if (!wifiIsConnected()) {
    if (reasonOut && reasonLen > 0) {
      strncpy(reasonOut, "WiFi offline", reasonLen - 1);
    }
    return RELAY_ERROR;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, SUBMIT_URL)) {
    if (reasonOut && reasonLen > 0) {
      strncpy(reasonOut, "HTTP begin failed", reasonLen - 1);
    }
    return RELAY_ERROR;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.setTimeout(60000);

  Serial.println("[RELAY] POST submit-transaction");
  int code = http.POST((uint8_t*)signedJson, strlen(signedJson));
  String body = http.getString();
  http.end();

  Serial.printf("[RELAY] HTTP %d\n", code);
  Serial.println(body);

  if (code < 200 || code >= 300) {
    if (reasonOut && reasonLen > 0) {
      snprintf(reasonOut, reasonLen, "HTTP %d", code);
    }
    return RELAY_ERROR;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    if (reasonOut && reasonLen > 0) {
      strncpy(reasonOut, "Bad JSON response", reasonLen - 1);
    }
    return RELAY_ERROR;
  }

  const char* status = doc["status"];
  if (!status) {
    if (reasonOut && reasonLen > 0) {
      strncpy(reasonOut, "Missing status", reasonLen - 1);
    }
    return RELAY_ERROR;
  }

  return parseStatus(status, reasonOut, reasonLen, doc);
}
