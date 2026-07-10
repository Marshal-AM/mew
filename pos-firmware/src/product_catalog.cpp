#include "product_catalog.h"

#include "config.h"
#include "wifi_setup.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <string.h>

#ifndef POS_PRODUCTS_URL
#define POS_PRODUCTS_URL ""
#endif

#ifndef SUPABASE_ANON_KEY
#define SUPABASE_ANON_KEY ""
#endif

static CatalogProduct catalog[MAX_CATALOG_PRODUCTS];
static uint8_t catalogCount = 0;
static bool catalogLoaded = false;
static unsigned long lastSyncAttemptMs = 0;
static const unsigned long SYNC_RETRY_MS = 30000;

static void clearCatalog() {
  memset(catalog, 0, sizeof(catalog));
  catalogCount = 0;
  catalogLoaded = false;
}

void productCatalogInit() {
  clearCatalog();
  lastSyncAttemptMs = 0;
}

bool productCatalogIsLoaded() {
  return catalogLoaded;
}

uint8_t productCatalogCount() {
  return catalogCount;
}

const CatalogProduct* productCatalogAt(uint8_t index) {
  if (index >= catalogCount) {
    return nullptr;
  }
  return &catalog[index];
}

const CatalogProduct* productCatalogFindBySlot(uint8_t slot) {
  if (slot < 1 || slot > 9) {
    return nullptr;
  }
  for (uint8_t i = 0; i < catalogCount; i++) {
    if (catalog[i].pos_slot == slot) {
      return &catalog[i];
    }
  }
  return nullptr;
}

bool productCatalogSync() {
  if (strlen(POS_PRODUCTS_URL) == 0 || strlen(SUPABASE_ANON_KEY) == 0) {
    Serial.println("[PRODUCTS] catalog URL or anon key not configured");
    return false;
  }

  if (!wifiIsConnected()) {
    Serial.println("[PRODUCTS] WiFi offline, skip sync");
    return false;
  }

  char url[256];
  snprintf(url, sizeof(url), "%s?pos_id=%s", POS_PRODUCTS_URL, POS_ID);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, url)) {
    Serial.println("[PRODUCTS] HTTP begin failed");
    return false;
  }

  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.setTimeout(15000);

  Serial.print("[PRODUCTS] GET ");
  Serial.println(url);
  int code = http.GET();
  String body = http.getString();
  http.end();

  Serial.printf("[PRODUCTS] HTTP %d\n", code);
  if (code < 200 || code >= 300) {
    Serial.println(body);
    return false;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("[PRODUCTS] JSON parse failed");
    return false;
  }

  JsonArray products = doc["products"].as<JsonArray>();
  if (products.isNull()) {
    Serial.println("[PRODUCTS] missing products array");
    return false;
  }

  clearCatalog();
  for (JsonObject item : products) {
    if (catalogCount >= MAX_CATALOG_PRODUCTS) {
      break;
    }

    const char* id = item["id"] | "";
    const char* name = item["name"] | "";
    uint8_t slot = item["pos_slot"] | 0;
    if (strlen(id) == 0 || slot < 1 || slot > 9) {
      continue;
    }

    CatalogProduct* row = &catalog[catalogCount];
    strncpy(row->id, id, sizeof(row->id) - 1);
    strncpy(row->name, name, sizeof(row->name) - 1);
    row->pos_slot = slot;
    catalogCount++;
    Serial.printf("[PRODUCTS] slot %u: %s (%s)\n", slot, name, id);
  }

  catalogLoaded = true;
  Serial.printf("[PRODUCTS] loaded %u item(s)\n", catalogCount);
  return true;
}

void productCatalogLoop() {
  if (catalogLoaded) {
    return;
  }
  if (!wifiIsConnected()) {
    return;
  }
  if (lastSyncAttemptMs != 0 && millis() - lastSyncAttemptMs < SYNC_RETRY_MS) {
    return;
  }
  lastSyncAttemptMs = millis();
  productCatalogSync();
}
