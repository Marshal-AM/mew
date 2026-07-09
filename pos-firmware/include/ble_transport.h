#pragma once

#include <stddef.h>
#include "relay_client.h"

typedef void (*SignedPaymentHandler)(const char* json);

void bleTransportInit();
void bleTransportLoop();
void bleTransportOnQrShown();
void bleTransportSetSignedPaymentHandler(SignedPaymentHandler handler);
bool bleTransportTakePendingSignedPayment(char* out, size_t outLen);
void bleTransportNotifySettlement(RelayResult result, const char* reason, const char* txHash);
