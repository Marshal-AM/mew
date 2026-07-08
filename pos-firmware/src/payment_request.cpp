#include "payment_request.h"

#include "config.h"
#include "time_util.h"

#include <Arduino.h>
#include <esp_random.h>
#include <stdio.h>
#include <string.h>

static void bytesToHex(const uint8_t* bytes, size_t len, char* out) {
  static const char HEX_CHARS[] = "0123456789abcdef";
  for (size_t i = 0; i < len; i++) {
    out[i * 2] = HEX_CHARS[(bytes[i] >> 4) & 0x0F];
    out[i * 2 + 1] = HEX_CHARS[bytes[i] & 0x0F];
  }
  out[len * 2] = '\0';
}

void formatAmount(uint32_t cents, char* out, size_t outLen) {
  uint32_t dollars = cents / 100;
  uint32_t remainder = cents % 100;
  snprintf(out, outLen, "%lu.%02lu", (unsigned long)dollars, (unsigned long)remainder);
}

bool buildPaymentRequest(uint32_t cents, PaymentRequest* out) {
  if (out == nullptr || cents == 0) {
    return false;
  }

  uint8_t reqIdBytes[3];
  uint8_t posNonceBytes[16];
  esp_fill_random(reqIdBytes, sizeof(reqIdBytes));
  esp_fill_random(posNonceBytes, sizeof(posNonceBytes));

  bytesToHex(reqIdBytes, sizeof(reqIdBytes), out->reqId);
  bytesToHex(posNonceBytes, sizeof(posNonceBytes), out->posNonce);

  out->exp = unixNow() + PAYMENT_TTL_SEC;

  char amount[16];
  formatAmount(cents, amount, sizeof(amount));

  int written = snprintf(
      out->json,
      sizeof(out->json),
      "{\"%s\":\"%s\",\"%s\":\"%s\",\"%s\":\"%s\",\"%s\":\"%s\",\"%s\":%lu}",
      FIELD_POS_ID,
      POS_ID,
      FIELD_AMT,
      amount,
      FIELD_REQ_ID,
      out->reqId,
      FIELD_POS_NONCE,
      out->posNonce,
      FIELD_EXP,
      (unsigned long)out->exp);

  if (written < 0 || (size_t)written >= sizeof(out->json)) {
    return false;
  }

  Serial.print("[PAYMENT_REQUEST] ");
  Serial.println(out->json);
  return true;
}
