#include "ui_state.h"

#include "config.h"
#include "display.h"
#include "ble_transport.h"
#include "relay_client.h"

#include <Arduino.h>
#include <string.h>

static uint8_t digitKeyCount = 0;

static void appendDigit(UiContext* ctx, char digit) {
  if (digitKeyCount >= MAX_DIGIT_KEYS) {
    Serial.println("[UI] max digit keys reached");
    return;
  }

  if (ctx->cents > (MAX_AMOUNT_CENTS / 10)) {
    Serial.println("[UI] amount cap reached");
    return;
  }

  uint8_t value = (uint8_t)(digit - '0');
  ctx->cents = (ctx->cents * 10) + value;
  digitKeyCount++;
}

static void resetAmount(UiContext* ctx) {
  ctx->cents = 0;
  digitKeyCount = 0;
  ctx->state = STATE_ENTER_AMOUNT;
  memset(&ctx->request, 0, sizeof(ctx->request));
  showEntryScreen(ctx->cents);
}

static bool extractJsonStringField(const char* json, const char* key, char* out, size_t outLen) {
  char pattern[32];
  snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
  const char* start = strstr(json, pattern);
  if (start == nullptr) {
    return false;
  }
  start += strlen(pattern);
  const char* end = strchr(start, '"');
  if (end == nullptr || (size_t)(end - start) >= outLen) {
    return false;
  }
  size_t len = (size_t)(end - start);
  memcpy(out, start, len);
  out[len] = '\0';
  return true;
}

void uiInit(UiContext* ctx) {
  ctx->state = STATE_ENTER_AMOUNT;
  ctx->cents = 0;
  digitKeyCount = 0;
  memset(&ctx->request, 0, sizeof(ctx->request));
  showEntryScreen(ctx->cents);
}

void uiOnSignedPayment(UiContext* ctx, const char* json) {
  if (ctx == nullptr || json == nullptr) {
    return;
  }

  char posNonce[POS_NONCE_HEX_LEN + 1];
  if (!extractJsonStringField(json, "posNonce", posNonce, sizeof(posNonce))) {
    showError("Bad payment");
    Serial.println("[UI] signed payment missing posNonce");
    return;
  }

  if (strcmp(posNonce, ctx->request.posNonce) != 0) {
    showError("Nonce mismatch");
    Serial.println("[UI] posNonce mismatch");
    return;
  }

  ctx->state = STATE_PENDING;
  showPendingScreen(ctx->cents);

  char reason[96];
  RelayResult result = relaySubmitPayment(json, reason, sizeof(reason));

  switch (result) {
    case RELAY_APPROVED:
      ctx->state = STATE_APPROVED;
      showApprovedScreen(ctx->cents);
      Serial.println("[UI] settlement APPROVED");
      break;
    case RELAY_HELD:
      ctx->state = STATE_HELD;
      showHeldScreen(reason);
      Serial.println("[UI] settlement HELD");
      break;
    case RELAY_DECLINED:
      ctx->state = STATE_DECLINED;
      showDeclinedScreen(reason);
      Serial.println("[UI] settlement DECLINED");
      break;
    default:
      ctx->state = STATE_DECLINED;
      showDeclinedScreen(reason[0] ? reason : "Relay error");
      Serial.println("[UI] settlement ERROR");
      break;
  }
}

void uiHandleKey(UiContext* ctx, KeyEvent event) {
  if (event.type == KEY_NONE || event.type == KEY_LONG_ZERO) {
    return;
  }

  if (event.type == KEY_CLEAR) {
    if (ctx->state == STATE_ENTER_AMOUNT) {
      resetAmount(ctx);
    } else if (
        ctx->state == STATE_SHOW_QR || ctx->state == STATE_APPROVED || ctx->state == STATE_DECLINED ||
        ctx->state == STATE_HELD) {
      resetAmount(ctx);
    }
    return;
  }

  if (ctx->state == STATE_SHOW_QR || ctx->state == STATE_PENDING) {
    return;
  }

  if (ctx->state != STATE_ENTER_AMOUNT) {
    return;
  }

  if (event.type == KEY_DIGIT) {
    appendDigit(ctx, event.digit);
    showEntryScreen(ctx->cents);
    return;
  }

  if (event.type == KEY_CONFIRM) {
    if (ctx->cents == 0) {
      showError("Enter amount");
      Serial.println("[UI] confirm with zero amount");
      return;
    }

    if (!buildPaymentRequest(ctx->cents, &ctx->request)) {
      showError("Request failed");
      Serial.println("[UI] payment request build failed");
      return;
    }

    ctx->state = STATE_SHOW_QR;
    showQrScreen(ctx->request.json, ctx->cents);
    bleTransportOnQrShown();
  }
}
