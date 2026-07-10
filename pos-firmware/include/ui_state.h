#pragma once

#include "keypad_input.h"
#include "payment_request.h"

typedef enum {
  STATE_SELECT_PRODUCT,
  STATE_ENTER_AMOUNT,
  STATE_SHOW_QR,
  // Backend-driven settlement UI
  STATE_PENDING,
  STATE_APPROVED,
  STATE_DECLINED,
  STATE_HELD,
} UiState;

typedef struct {
  UiState state;
  uint32_t cents;
  PaymentRequest request;
  char selectedProductId[37];
  char selectedProductName[25];
  bool hasProduct;
} UiContext;

void uiInit(UiContext* ctx);
void uiHandleKey(UiContext* ctx, KeyEvent event);
void uiOnSignedPayment(UiContext* ctx, const char* json);
void uiRefreshProductScreenIfNeeded(UiContext* ctx);
