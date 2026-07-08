#pragma once

#include <stddef.h>
#include <stdint.h>

#include "config.h"

#define FIELD_POS_ID "posId"
#define FIELD_AMT "amt"
#define FIELD_REQ_ID "reqId"
#define FIELD_POS_NONCE "posNonce"
#define FIELD_EXP "exp"

#define REQ_ID_HEX_LEN 6
#define POS_NONCE_HEX_LEN 32

typedef struct {
  char json[PAYMENT_JSON_MAX];
  char reqId[REQ_ID_HEX_LEN + 1];
  char posNonce[POS_NONCE_HEX_LEN + 1];
  uint32_t exp;
} PaymentRequest;

void formatAmount(uint32_t cents, char* out, size_t outLen);
bool buildPaymentRequest(uint32_t cents, PaymentRequest* out);
