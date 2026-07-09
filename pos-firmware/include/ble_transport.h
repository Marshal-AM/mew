#pragma once

#include <stddef.h>

typedef void (*SignedPaymentHandler)(const char* json);

void bleTransportInit();
void bleTransportLoop();
void bleTransportOnQrShown();
void bleTransportSetSignedPaymentHandler(SignedPaymentHandler handler);
bool bleTransportTakePendingSignedPayment(char* out, size_t outLen);
