#pragma once

#include <stddef.h>
#include <stdint.h>

#include "config.h"

// Compact QR wire format (pipe-delimited): posId|amt|reqId|posNonce|ttlSec|payoutAddress
// Wallet also accepts legacy JSON with long or short keys.

#define REQ_ID_HEX_LEN 6
#define POS_NONCE_BYTES 8
#define POS_NONCE_HEX_LEN (POS_NONCE_BYTES * 2)

typedef struct {
  char json[PAYMENT_JSON_MAX];
  char reqId[REQ_ID_HEX_LEN + 1];
  char posNonce[POS_NONCE_HEX_LEN + 1];
  uint32_t exp;
} PaymentRequest;

void formatAmount(uint32_t cents, char* out, size_t outLen);
bool buildPaymentRequest(uint32_t cents, PaymentRequest* out);
