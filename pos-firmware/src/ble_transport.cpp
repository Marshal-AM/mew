#include "ble_transport.h"

#include "ble_protocol.h"
#include "config.h"
#include "display.h"

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <stdio.h>
#include <string.h>

static NimBLEServer* server = nullptr;
static NimBLECharacteristic* notifyChar = nullptr;
static uint16_t negotiatedMtu = BLE_DEFAULT_MTU;
static BleChunkReassembler rxAssembler;
static uint8_t rxBuffer[BLE_MAX_MESSAGE_BYTES];
static SignedPaymentHandler signedPaymentHandler = nullptr;
static const uint16_t BLE_NOTIFY_GAP_MS = 30;
static char pendingSignedPayment[BLE_MAX_MESSAGE_BYTES];
static bool pendingSignedPaymentReady = false;
static bool bleClientConnected = false;

static char deviceName[24];

class MooServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* /*pServer*/, NimBLEConnInfo& connInfo) override {
    bleClientConnected = true;
    Serial.printf("[BLE] client connected: %s\n", connInfo.getAddress().toString().c_str());
    server->updateConnParams(connInfo.getConnHandle(), 24, 48, 0, 180);
  }

  void onDisconnect(NimBLEServer* /*pServer*/, NimBLEConnInfo& /*connInfo*/, int reason) override {
    bleClientConnected = false;
    Serial.printf("[BLE] client disconnected (%d)\n", reason);
    rxAssembler.reset();
    NimBLEDevice::startAdvertising();
  }

  void onMTUChange(uint16_t mtu, NimBLEConnInfo& connInfo) override {
    negotiatedMtu = mtu;
    Serial.printf("[BLE] MTU %u (conn %u)\n", mtu, connInfo.getConnHandle());
  }
};

static MooServerCallbacks serverCallbacks;

static void notifyJson(const char* json) {
  if (notifyChar == nullptr) {
    Serial.println("[BLE] notify skipped: characteristic not ready");
    return;
  }
  notifyChar->setValue((uint8_t*)json, strlen(json));
  notifyChar->notify();
  // Android was only receiving the final notify in a burst (often "echo_done"),
  // so pace server notifications slightly to avoid overwriting earlier payloads.
  delay(BLE_NOTIFY_GAP_MS);
}

static void notifyPosInfo() {
  char info[160];
  bleFormatPosInfo(POS_ID, POS_PAYOUT_ADDRESS, info, sizeof(info));
  notifyJson(info);
}

static const char* relayStatusToString(RelayResult result) {
  switch (result) {
    case RELAY_APPROVED:
      return "approved";
    case RELAY_HELD:
      return "held";
    case RELAY_DECLINED:
      return "declined";
    default:
      return "error";
  }
}

static void copyJsonSafe(const char* src, char* out, size_t outLen) {
  if (outLen == 0) {
    return;
  }
  size_t j = 0;
  for (size_t i = 0; src != nullptr && src[i] != '\0' && j + 1 < outLen; i++) {
    char c = src[i];
    if (c == '"' || c == '\\' || c == '\n' || c == '\r') {
      c = ' ';
    }
    out[j++] = c;
  }
  out[j] = '\0';
}

static bool queueSignedPayment(const char* json) {
  if (json == nullptr) {
    return false;
  }
  size_t len = strlen(json);
  if (len + 1 > sizeof(pendingSignedPayment)) {
    Serial.printf("[BLE] signed payment too large for queue (%u)\n", (unsigned)len);
    return false;
  }
  if (pendingSignedPaymentReady) {
    Serial.println("[BLE] signed payment queue busy");
    return false;
  }
  memcpy(pendingSignedPayment, json, len + 1);
  pendingSignedPaymentReady = true;
  Serial.printf("[BLE] queued signed payment len=%u\n", (unsigned)len);
  return true;
}

static void notifyEchoHex(const uint8_t* data, size_t len) {
  static const size_t kHexPerNotify = 160;
  size_t parts = (len + kHexPerNotify - 1) / kHexPerNotify;
  if (parts == 0) {
    parts = 1;
  }

  char notifyBuf[400];
  for (size_t part = 0; part < parts; part++) {
    size_t offset = part * kHexPerNotify;
    size_t chunk = len - offset;
    if (chunk > kHexPerNotify) {
      chunk = kHexPerNotify;
    }

    int written = snprintf(notifyBuf, sizeof(notifyBuf), "{\"t\":\"ep\",\"i\":%u,\"n\":%u,\"h\":\"", (unsigned)part, (unsigned)parts);
    for (size_t i = 0; i < chunk && written < (int)sizeof(notifyBuf) - 4; i++) {
      written += snprintf(notifyBuf + written, sizeof(notifyBuf) - written, "%02x", data[offset + i]);
    }
    snprintf(notifyBuf + written, sizeof(notifyBuf) - written, "\"}");
    notifyJson(notifyBuf);
    delay(15);
  }
  notifyJson("{\"t\":\"echo_done\"}");
}

class MooWriteCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& /*connInfo*/) override {
    std::string frame = pCharacteristic->getValue();
    if (frame.size() < 2) {
      char err[32];
      bleFormatErr("frame", err, sizeof(err));
      notifyJson(err);
      return;
    }

    uint8_t seq = (uint8_t)frame[0];
    uint8_t total = (uint8_t)frame[1];
    const uint8_t* payload = (const uint8_t*)frame.data() + 2;
    size_t payloadLen = frame.size() - 2;

    char ack[32];
    bleFormatChunkAck(seq, ack, sizeof(ack));
    notifyJson(ack);

    size_t assembledLen = 0;
    if (!rxAssembler.addChunk(seq, total, payload, payloadLen, rxBuffer, &assembledLen)) {
      return;
    }

    if (!bleVerifyAndStripCrc(rxBuffer, &assembledLen)) {
      Serial.println("[BLE] CRC failed");
      char err[32];
      bleFormatErr("crc", err, sizeof(err));
      notifyJson(err);
      return;
    }

    rxBuffer[assembledLen] = '\0';
    const bool isSignedPayment = strstr((const char*)rxBuffer, "\"t\":\"sp\"") != nullptr;
    const bool isPosInfoRequest = strstr((const char*)rxBuffer, "\"t\":\"pi\"") != nullptr;

    if (isSignedPayment) {
      const char* nonceKey = "\"posNonce\":\"";
      const char* start = strstr((const char*)rxBuffer, nonceKey);
      if (start != nullptr) {
        start += strlen(nonceKey);
        const char* end = strchr(start, '"');
        if (end != nullptr && end - start < 80) {
          char nonceBuf[80];
          size_t len = (size_t)(end - start);
          memcpy(nonceBuf, start, len);
          nonceBuf[len] = '\0';
          Serial.print("[BLE_SIGNED_PAYMENT] posNonce=");
          Serial.println(nonceBuf);
        }
      } else {
        Serial.println("[BLE_SIGNED_PAYMENT] received");
      }
    }
    Serial.print("[BLE_RX] ");
    Serial.println((const char*)rxBuffer);

    if (isPosInfoRequest) {
      Serial.println("[BLE] payout info requested");
      notifyPosInfo();
      return;
    }

    char ok[48];
    bleFormatOk(assembledLen, ok, sizeof(ok));
    notifyJson(ok);

    if (isSignedPayment) {
      Serial.println("[BLE_SIGNED_PAYMENT] queueing for main loop");
      if (!queueSignedPayment((const char*)rxBuffer)) {
        char err[32];
        bleFormatErr("queue", err, sizeof(err));
        notifyJson(err);
      }
    } else if (displayIsReady()) {
      showError("BLE OK");
    }

    notifyEchoHex(rxBuffer, assembledLen);
  }
};

static MooWriteCallbacks writeCallbacks;

void bleTransportInit() {
  snprintf(deviceName, sizeof(deviceName), "Moo-%s", POS_ID);

  NimBLEDevice::init(deviceName);

  server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);

  NimBLEService* service = server->createService(MOO_BLE_SERVICE_UUID);
  NimBLECharacteristic* writeChar = service->createCharacteristic(
      MOO_BLE_WRITE_CHAR_UUID,
      NIMBLE_PROPERTY::WRITE);
  writeChar->setCallbacks(&writeCallbacks);

  notifyChar = service->createCharacteristic(
      MOO_BLE_NOTIFY_CHAR_UUID,
      NIMBLE_PROPERTY::NOTIFY);

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->setName(deviceName);
  advertising->addServiceUUID(service->getUUID());
  advertising->enableScanResponse(true);
  advertising->start();

  Serial.print("[BLE] advertising as ");
  Serial.println(deviceName);
}

void bleTransportLoop() {
  if (rxAssembler.isStale(millis())) {
    rxAssembler.reset();
  }
}

void bleTransportOnQrShown() {
  Serial.print("[BLE] connect via ");
  Serial.println(deviceName);
}

void bleTransportSetSignedPaymentHandler(SignedPaymentHandler handler) {
  signedPaymentHandler = handler;
}

void bleTransportNotifySettlement(RelayResult result, const char* reason, const char* txHash) {
  char safeReason[128];
  char safeTxHash[96];
  copyJsonSafe(reason, safeReason, sizeof(safeReason));
  copyJsonSafe(txHash, safeTxHash, sizeof(safeTxHash));

  char payload[320];
  if (safeTxHash[0] != '\0') {
    snprintf(
        payload,
        sizeof(payload),
        "{\"t\":\"sr\",\"status\":\"%s\",\"reason\":\"%s\",\"txHash\":\"%s\"}",
        relayStatusToString(result),
        safeReason,
        safeTxHash);
  } else {
    snprintf(
        payload,
        sizeof(payload),
        "{\"t\":\"sr\",\"status\":\"%s\",\"reason\":\"%s\"}",
        relayStatusToString(result),
        safeReason);
  }

  Serial.printf(
      "[BLE_SETTLEMENT] preparing notify status=%s client_connected=%s\n",
      relayStatusToString(result),
      bleClientConnected ? "yes" : "no");
  if (safeReason[0] != '\0') {
    Serial.printf("[BLE_SETTLEMENT] reason=%s\n", safeReason);
  }
  if (safeTxHash[0] != '\0') {
    Serial.printf("[BLE_SETTLEMENT] txHash=%s\n", safeTxHash);
  }
  Serial.print("[BLE_SETTLEMENT] notify payload: ");
  Serial.println(payload);
  if (!bleClientConnected) {
    Serial.println("[BLE_SETTLEMENT] WARN phone not connected; settlement notify may be missed");
  }

  notifyJson(payload);
  Serial.println("[BLE_SETTLEMENT] notify transmitted");
}

bool bleTransportTakePendingSignedPayment(char* out, size_t outLen) {
  if (!pendingSignedPaymentReady || out == nullptr || outLen == 0) {
    return false;
  }
  size_t len = strlen(pendingSignedPayment);
  if (len + 1 > outLen) {
    Serial.printf("[BLE] pending signed payment does not fit output buffer (%u)\n", (unsigned)len);
    return false;
  }
  memcpy(out, pendingSignedPayment, len + 1);
  pendingSignedPayment[0] = '\0';
  pendingSignedPaymentReady = false;
  Serial.printf("[BLE] dequeued signed payment len=%u\n", (unsigned)len);
  return true;
}
