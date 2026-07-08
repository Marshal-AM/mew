#pragma once

#include "keypad_input.h"
#include "payment_request.h"

typedef enum {
  STATE_ENTER_AMOUNT,
  STATE_SHOW_QR,
  // Stubbed for Phase 7+ (backend-driven settlement UI)
  STATE_PENDING,
  STATE_APPROVED,
  STATE_DECLINED,
  STATE_HELD,
} UiState;

typedef struct {
  UiState state;
  uint32_t cents;
  PaymentRequest request;
} UiContext;

void uiInit(UiContext* ctx);
void uiHandleKey(UiContext* ctx, KeyEvent event);
void uiOnSignedPayment(UiContext* ctx, const char* json);
