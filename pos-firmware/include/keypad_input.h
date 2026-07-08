#pragma once

#include <stdint.h>

typedef enum {
  KEY_NONE = 0,
  KEY_DIGIT,
  KEY_CONFIRM,
  KEY_CLEAR,
  KEY_LONG_ZERO,
} KeyEventType;

typedef struct {
  KeyEventType type;
  char digit;
} KeyEvent;

void keypadInit();
KeyEvent keypadPoll();
