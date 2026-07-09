#pragma once

#include <stddef.h>
#include <stdint.h>

#define MOO_BLE_SERVICE_UUID "6d6f6f01-0000-4000-8000-000000000001"
#define MOO_BLE_WRITE_CHAR_UUID "6d6f6f02-0000-4000-8000-000000000002"
#define MOO_BLE_NOTIFY_CHAR_UUID "6d6f6f03-0000-4000-8000-000000000003"

#define BLE_TARGET_MTU 247
#define BLE_DEFAULT_MTU 23
#define BLE_MAX_MESSAGE_BYTES 4096
#define BLE_REASSEMBLY_TIMEOUT_MS 120000

uint16_t bleCrc16CcittFalse(const uint8_t* data, size_t len);
bool bleVerifyAndStripCrc(uint8_t* buffer, size_t* len);
size_t bleChunkPayloadSize(uint16_t mtu);
void bleFormatChunkAck(uint8_t seq, char* out, size_t outLen);
void bleFormatOk(size_t len, char* out, size_t outLen);
void bleFormatErr(const char* code, char* out, size_t outLen);
void bleFormatPosInfo(const char* posId, const char* payoutAddress, char* out, size_t outLen);

class BleChunkReassembler {
 public:
  void reset();
  bool addChunk(uint8_t seq, uint8_t total, const uint8_t* payload, size_t payloadLen, uint8_t* out, size_t* outLen);
  bool isStale(unsigned long nowMs) const;

 private:
  uint8_t total_ = 0;
  uint8_t received_ = 0;
  uint8_t chunkLens_[255];
  uint8_t chunkData_[255][256];
  bool chunkSeen_[255];
  unsigned long lastUpdateMs_ = 0;
};
