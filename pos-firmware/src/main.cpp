#include "config.h"
#include "display.h"
#include "keypad_input.h"
#include "ble_protocol.h"
#include "ui_state.h"
#include "ble_transport.h"
#include "wifi_setup.h"
#include "time_util.h"
#include "product_catalog.h"
#include "audio_i2s.h"

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
  Serial.println("Moo POS firmware — Phase 7 + products + audio");
  Serial.print("Pin profile: ");
  Serial.println(PIN_PROFILE_NAME);
  Serial.print("POS ID: ");
  Serial.println(POS_ID);

  if (!displayInit()) {
    Serial.println("[FATAL] display init failed");
  } else {
    showBootStatusScreen("Starting…");
  }

  timeInitNtp();
  if (displayIsReady()) {
    showBootStatusScreen("WiFi…");
  }
  wifiSetupInit();
  productCatalogInit();
  keypadInit();
  if (displayIsReady()) {
    showBootStatusScreen("BLE…");
  }
  bleTransportInit();
  bleTransportSetSignedPaymentHandler(onSignedPayment);

  if (displayIsReady()) {
    uiInit(&ui);
    Serial.println("Ready. Select product (1-9), enter amount, press # to show QR.");
  }

#if defined(AUDIO_ENABLE)
  if (audioInit()) {
    Serial.println("Audio ready. Keypad A=record B=play C=speaker test. Serial: P/D/M/L/S");
  } else {
    Serial.println("[AUDIO] init failed — check I2S wiring");
  }
#endif
}

void loop() {
  wifiLoop();
  productCatalogLoop();

#if defined(AUDIO_ENABLE)
  if (audioVoiceIsRecording()) {
    for (int i = 0; i < 8; i++) {
      audioLoop();
    }
  } else {
    audioLoop();
  }

  if (Serial.available() > 0) {
    char cmd = (char)Serial.read();
    if (cmd == 'L' || cmd == 'l') {
      audioLoopbackTest(AUDIO_LOOPBACK_DEFAULT_SEC);
    } else if (cmd == 'M' || cmd == 'm') {
      audioProbeMic(500);
    } else if (cmd == 'D' || cmd == 'd') {
      audioDetectHardware();
    } else if (cmd == 'P' || cmd == 'p') {
      audioDeepDiag();
    } else if (cmd == 'S' || cmd == 's') {
      audioSpeakerDiag();
    }
  }
#endif

  static bool catalogScreenSynced = false;
  if (productCatalogIsLoaded() && !catalogScreenSynced) {
    catalogScreenSynced = true;
    uiRefreshProductScreenIfNeeded(&ui);
  }

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
  if (event.type == KEY_LONG_ZERO) {
#if defined(AUDIO_ENABLE)
    Serial.println("[AUDIO] long-press 0 → 2s loopback test");
    audioLoopbackTest(AUDIO_LOOPBACK_DEFAULT_SEC);
#endif
  } else if (event.type == KEY_ACTION_A) {
#if defined(AUDIO_ENABLE)
    audioVoiceStartRecord();
#endif
  } else if (event.type == KEY_ACTION_B) {
#if defined(AUDIO_ENABLE)
    audioVoicePlayRecorded();
#endif
  } else if (event.type == KEY_ACTION_C) {
#if defined(AUDIO_ENABLE)
    audioSpeakerDiag();
#endif
  } else if (event.type != KEY_NONE) {
    uiHandleKey(&ui, event);
  }

#if defined(AUDIO_ENABLE)
  if (audioVoiceIsRecording()) {
    delay(1);
  } else {
    delay(10);
  }
#else
  delay(10);
#endif
}
