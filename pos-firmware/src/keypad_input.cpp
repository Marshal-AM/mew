#include "keypad_input.h"

#include "config.h"

#include <Arduino.h>
#include <Keypad.h>

static char keyMap[KEYPAD_ROWS][KEYPAD_COLS] = {
    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'},
};

static Keypad keypad = Keypad(
    makeKeymap(keyMap),
    (byte*)KEYPAD_ROW_PINS,
    (byte*)KEYPAD_COL_PINS,
    KEYPAD_ROWS,
    KEYPAD_COLS);

void keypadInit() {
  keypad.setHoldTime(LONG_PRESS_MS);
  Serial.print("[KEYPAD] rows GPIO ");
  for (uint8_t i = 0; i < KEYPAD_ROWS; i++) {
    Serial.print(KEYPAD_ROW_PINS[i]);
    if (i + 1 < KEYPAD_ROWS) Serial.print(",");
  }
  Serial.print(" | cols GPIO ");
  for (uint8_t i = 0; i < KEYPAD_COLS; i++) {
    Serial.print(KEYPAD_COL_PINS[i]);
    if (i + 1 < KEYPAD_COLS) Serial.print(",");
  }
  Serial.println();
}

KeyEvent keypadPoll() {
  char key = keypad.getKey();

  if (key == NO_KEY) {
    return {KEY_NONE, '\0'};
  }

  Serial.printf("[KEYPAD] pressed '%c'\n", key);

  if (key == HOLD) {
    Serial.println("[KEYPAD] long-press 0 (reserved for voice, Phase 16)");
    return {KEY_LONG_ZERO, '0'};
  }

  if (key >= '0' && key <= '9') {
    return {KEY_DIGIT, key};
  }

  if (key == '#') {
    return {KEY_CONFIRM, '#'};
  }

  if (key == '*') {
    return {KEY_CLEAR, '*'};
  }

  return {KEY_NONE, '\0'};
}
