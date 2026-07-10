#include "ui_state.h"

#include "config.h"
#include "display.h"
#include "ble_transport.h"
#include "relay_client.h"
#include "product_catalog.h"

#include <Arduino.h>
#include <string.h>

static uint8_t digitKeyCount = 0;

static void clearSelectedProduct(UiContext* ctx) {
  ctx->selectedProductId[0] = '\0';
  ctx->selectedProductName[0] = '\0';
  ctx->hasProduct = false;
}

static void setSelectedProduct(UiContext* ctx, const CatalogProduct* product) {
  if (product == nullptr) {
    clearSelectedProduct(ctx);
    return;
  }
  strncpy(ctx->selectedProductId, product->id, sizeof(ctx->selectedProductId) - 1);
  strncpy(ctx->selectedProductName, product->name, sizeof(ctx->selectedProductName) - 1);
  ctx->hasProduct = true;
}

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

static void beginNewSale(UiContext* ctx) {
  ctx->cents = 0;
  digitKeyCount = 0;
  ctx->state = STATE_SELECT_PRODUCT;
  memset(&ctx->request, 0, sizeof(ctx->request));
  clearSelectedProduct(ctx);
  showProductSelectScreen();
}

static void goToAmountEntry(UiContext* ctx) {
  ctx->cents = 0;
  digitKeyCount = 0;
  ctx->state = STATE_ENTER_AMOUNT;
  showEntryScreen(ctx->cents, ctx->hasProduct ? ctx->selectedProductName : nullptr);
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
  beginNewSale(ctx);
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
  char txHash[96];
  const char* productId = ctx->hasProduct ? ctx->selectedProductId : "";
  RelayResult result = relaySubmitPayment(json, productId, reason, sizeof(reason), txHash, sizeof(txHash));
  Serial.println("[UI] relay complete; sending settlement result over BLE");
  bleTransportNotifySettlement(result, reason, txHash);

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

static void handleSelectProductKey(UiContext* ctx, KeyEvent event) {
  if (event.type == KEY_CLEAR) {
    showProductSelectScreen();
    return;
  }

  if (event.type == KEY_CONFIRM) {
    Serial.println("[UI] custom sale (no product)");
    goToAmountEntry(ctx);
    return;
  }

  if (event.type != KEY_DIGIT) {
    return;
  }

  uint8_t slot = (uint8_t)(event.digit - '0');
  if (slot == 0) {
    Serial.println("[UI] custom sale via 0");
    goToAmountEntry(ctx);
    return;
  }

  const CatalogProduct* product = productCatalogFindBySlot(slot);
  if (product == nullptr) {
    showError("No product");
    Serial.printf("[UI] no product on slot %u\n", slot);
    delay(800);
    showProductSelectScreen();
    return;
  }

  setSelectedProduct(ctx, product);
  Serial.printf("[UI] selected slot %u: %s\n", slot, product->name);
  goToAmountEntry(ctx);
}

void uiRefreshProductScreenIfNeeded(UiContext* ctx) {
  if (ctx != nullptr && ctx->state == STATE_SELECT_PRODUCT) {
    showProductSelectScreen();
  }
}

void uiHandleKey(UiContext* ctx, KeyEvent event) {
  if (event.type == KEY_NONE || event.type == KEY_LONG_ZERO) {
    return;
  }

  if (event.type == KEY_CLEAR) {
    if (ctx->state == STATE_SELECT_PRODUCT) {
      showProductSelectScreen();
      return;
    }
    if (ctx->state == STATE_ENTER_AMOUNT) {
      if (ctx->cents > 0 || digitKeyCount > 0) {
        ctx->cents = 0;
        digitKeyCount = 0;
        showEntryScreen(ctx->cents, ctx->hasProduct ? ctx->selectedProductName : nullptr);
        return;
      }
      ctx->state = STATE_SELECT_PRODUCT;
      clearSelectedProduct(ctx);
      showProductSelectScreen();
      Serial.println("[UI] back to product select");
      return;
    }
    if (
        ctx->state == STATE_SHOW_QR || ctx->state == STATE_APPROVED || ctx->state == STATE_DECLINED ||
        ctx->state == STATE_HELD) {
      beginNewSale(ctx);
    }
    return;
  }

  if (ctx->state == STATE_SELECT_PRODUCT) {
    handleSelectProductKey(ctx, event);
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
    showEntryScreen(ctx->cents, ctx->hasProduct ? ctx->selectedProductName : nullptr);
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
