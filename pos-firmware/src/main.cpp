#include "config.h"
#include "display.h"
#include "keypad_input.h"
#include "ble_protocol.h"
#include "ui_state.h"
#include "ble_transport.h"
#include "wifi_setup.h"
#include "time_util.h"

#include <Arduino.h>

static UiContext ui;
static char pendingSignedPaymentJson[BLE_MAX_MESSAGE_BYTES];

static void onSignedPayment(const char* json) {
  uiOnSignedPayment(&ui, json);
}

void setup() {
  Serial.begin(115200);
#if defined(BOARD_ESP32_S3)
  unsigned long serialWait = millis();
  while (!Serial && (millis() - serialWait) < 4000) {
    delay(10);
  }
#endif
  delay(300);

  Serial.println();
  Serial.println("Moo POS firmware — Phase 7");
  Serial.print("Pin profile: ");
  Serial.println(PIN_PROFILE_NAME);
  Serial.print("POS ID: ");
  Serial.println(POS_ID);

  timeInitNtp();
  wifiSetupInit();
  keypadInit();
  bleTransportInit();
  bleTransportSetSignedPaymentHandler(onSignedPayment);

  if (!displayInit()) {
    Serial.println("[FATAL] display init failed");
  } else {
    uiInit(&ui);
    Serial.println("Ready. Enter amount, press # to show QR.");
  }
}

void loop() {
  wifiLoop();

  if (!displayIsReady()) {
    delay(50);
    return;
  }

  bleTransportLoop();

  if (bleTransportTakePendingSignedPayment(pendingSignedPaymentJson, sizeof(pendingSignedPaymentJson))) {
    Serial.println("[MAIN] processing queued signed payment");
    onSignedPayment(pendingSignedPaymentJson);
  }

  KeyEvent event = keypadPoll();
  if (event.type != KEY_NONE) {
    uiHandleKey(&ui, event);
  }

  delay(10);
}
