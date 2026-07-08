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

static char deviceName[24];

class MooServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* /*pServer*/, NimBLEConnInfo& connInfo) override {
    Serial.printf("[BLE] client connected: %s\n", connInfo.getAddress().toString().c_str());
    server->updateConnParams(connInfo.getConnHandle(), 24, 48, 0, 180);
  }

  void onDisconnect(NimBLEServer* /*pServer*/, NimBLEConnInfo& /*connInfo*/, int reason) override {
    Serial.printf("[BLE] client disconnected (%d)\n", reason);
    rxAssembler.reset();
    NimBLEDevice::startAdvertising();
  }

  void onMTUChange(uint16_t mtu, NimBLEConnInfo& connInfo) override {
    negotiatedMtu = mtu;
    Serial.printf("[BLE] MTU %u (conn %u)\n", mtu, connInfo.getConnHandle());
  }

  uint32_t onPassKeyDisplay() override {
    return BLE_DEV_PASSKEY;
  }

  void onConfirmPassKey(NimBLEConnInfo& connInfo, uint32_t passkey) override {
    Serial.printf("[BLE] confirm passkey %" PRIu32 "\n", passkey);
    NimBLEDevice::injectConfirmPasskey(connInfo, true);
  }

  void onAuthenticationComplete(NimBLEConnInfo& connInfo) override {
    if (!connInfo.isEncrypted()) {
      Serial.println("[BLE] encryption failed, disconnecting");
      NimBLEDevice::getServer()->disconnect(connInfo.getConnHandle());
      return;
    }
    Serial.printf("[BLE] secured: %s\n", connInfo.getAddress().toString().c_str());
  }
};

static MooServerCallbacks serverCallbacks;

static void notifyJson(const char* json) {
  if (notifyChar == nullptr) {
    return;
  }
  notifyChar->setValue((uint8_t*)json, strlen(json));
  notifyChar->notify();
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
    if (strstr((const char*)rxBuffer, "\"t\":\"sp\"") != nullptr) {
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

    char ok[48];
    bleFormatOk(assembledLen, ok, sizeof(ok));
    notifyJson(ok);

    if (strstr((const char*)rxBuffer, "\"t\":\"sp\"") != nullptr) {
      Serial.println("[BLE_SIGNED_PAYMENT] relaying to backend");
      if (signedPaymentHandler != nullptr) {
        signedPaymentHandler((const char*)rxBuffer);
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
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);
  NimBLEDevice::setSecurityPasskey(BLE_DEV_PASSKEY);
  NimBLEDevice::setSecurityAuth(true, true, true);

  server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);

  NimBLEService* service = server->createService(MOO_BLE_SERVICE_UUID);
  NimBLECharacteristic* writeChar = service->createCharacteristic(
      MOO_BLE_WRITE_CHAR_UUID,
      NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC);
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
