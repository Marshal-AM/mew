#pragma once

typedef void (*SignedPaymentHandler)(const char* json);

void bleTransportInit();
void bleTransportLoop();
void bleTransportOnQrShown();
void bleTransportSetSignedPaymentHandler(SignedPaymentHandler handler);
