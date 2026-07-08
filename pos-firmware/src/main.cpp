#include "config.h"
#include "display.h"
#include "keypad_input.h"
#include "ui_state.h"
#include "ble_transport.h"
#include "wifi_setup.h"
#include "time_util.h"

#include <Arduino.h>

static UiContext ui;

static void onSignedPayment(const char* json) {
  uiOnSignedPayment(&ui, json);
}

void setup() {
  Serial.begin(115200);
  delay(500);

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

  KeyEvent event = keypadPoll();
  if (event.type != KEY_NONE) {
    uiHandleKey(&ui, event);
  }

  delay(10);
}
