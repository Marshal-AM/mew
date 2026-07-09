#pragma once

#include <stddef.h>

typedef enum {
  RELAY_APPROVED,
  RELAY_DECLINED,
  RELAY_HELD,
  RELAY_ERROR,
} RelayResult;

RelayResult relaySubmitPayment(
    const char* signedJson,
    char* reasonOut,
    size_t reasonLen,
    char* txHashOut,
    size_t txHashLen);
