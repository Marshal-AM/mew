#include "ble_protocol.h"

#include <Arduino.h>
#include <stdio.h>
#include <string.h>

static const uint16_t CRC16_POLY = 0x1021;
static const uint16_t CRC16_INIT = 0xFFFF;

uint16_t bleCrc16CcittFalse(const uint8_t* data, size_t len) {
  uint16_t crc = CRC16_INIT;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (uint16_t)((crc << 1) ^ CRC16_POLY);
      } else {
        crc = (uint16_t)(crc << 1);
      }
    }
  }
  return crc;
}

bool bleVerifyAndStripCrc(uint8_t* buffer, size_t* len) {
  if (buffer == nullptr || len == nullptr || *len < 2) {
    return false;
  }

  size_t payloadLen = *len - 2;
  uint16_t expected = bleCrc16CcittFalse(buffer, payloadLen);
  uint16_t received = ((uint16_t)buffer[payloadLen] << 8) | buffer[payloadLen + 1];
  if (expected != received) {
    return false;
  }

  *len = payloadLen;
  return true;
}

size_t bleChunkPayloadSize(uint16_t mtu) {
  uint16_t effective = mtu;
  if (effective < BLE_DEFAULT_MTU) {
    effective = BLE_DEFAULT_MTU;
  }
  if (effective > 247) {
    effective = 247;
  }
  size_t attPayload = effective - 3;
  if (attPayload > 244) {
    attPayload = 244;
  }
  if (attPayload < 3) {
    attPayload = 3;
  }
  return attPayload - 2;
}

void bleFormatChunkAck(uint8_t seq, char* out, size_t outLen) {
  snprintf(out, outLen, "{\"t\":\"ca\",\"s\":%u}", seq);
}

void bleFormatOk(size_t len, char* out, size_t outLen) {
  snprintf(out, outLen, "{\"t\":\"ok\",\"len\":%u}", (unsigned)len);
}

void bleFormatErr(const char* code, char* out, size_t outLen) {
  snprintf(out, outLen, "{\"t\":\"err\",\"m\":\"%s\"}", code);
}

void bleFormatPosInfo(const char* posId, const char* payoutAddress, char* out, size_t outLen) {
  snprintf(
      out,
      outLen,
      "{\"t\":\"pi\",\"posId\":\"%s\",\"payoutAddress\":\"%s\"}",
      posId ? posId : "",
      payoutAddress ? payoutAddress : "");
}

void BleChunkReassembler::reset() {
  total_ = 0;
  received_ = 0;
  memset(chunkLens_, 0, sizeof(chunkLens_));
  memset(chunkData_, 0, sizeof(chunkData_));
  memset(chunkSeen_, 0, sizeof(chunkSeen_));
  lastUpdateMs_ = 0;
}

bool BleChunkReassembler::isStale(unsigned long nowMs) const {
  if (received_ == 0) {
    return false;
  }
  return (nowMs - lastUpdateMs_) > BLE_REASSEMBLY_TIMEOUT_MS;
}

bool BleChunkReassembler::addChunk(uint8_t seq, uint8_t total, const uint8_t* payload, size_t payloadLen, uint8_t* out, size_t* outLen) {
  if (total < 1 || seq >= total || payload == nullptr || out == nullptr || outLen == nullptr) {
    reset();
    return false;
  }

  if (received_ == 0) {
    total_ = total;
    memset(chunkLens_, 0, sizeof(chunkLens_));
    memset(chunkSeen_, 0, sizeof(chunkSeen_));
  } else if (total_ != total) {
    reset();
    return false;
  }

  if (chunkSeen_[seq]) {
    return false;
  }

  if (payloadLen > sizeof(chunkData_[0])) {
    reset();
    return false;
  }

  memcpy(chunkData_[seq], payload, payloadLen);
  chunkLens_[seq] = (uint8_t)payloadLen;
  chunkSeen_[seq] = true;
  received_++;
  lastUpdateMs_ = millis();

  if (received_ < total_) {
    return false;
  }

  size_t totalLen = 0;
  for (uint8_t i = 0; i < total_; i++) {
    if (!chunkSeen_[i]) {
      reset();
      return false;
    }
    if (totalLen + chunkLens_[i] > BLE_MAX_MESSAGE_BYTES) {
      reset();
      return false;
    }
    memcpy(out + totalLen, chunkData_[i], chunkLens_[i]);
    totalLen += chunkLens_[i];
  }

  *outLen = totalLen;
  reset();
  return true;
}
