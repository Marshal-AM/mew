#include "time_util.h"

#include "config.h"

#include <Arduino.h>
#include <time.h>

#ifndef NTP_SERVER
#define NTP_SERVER "pool.ntp.org"
#endif

void timeInitNtp() {
  configTime(0, 0, NTP_SERVER);
  Serial.print("[NTP] syncing via ");
  Serial.println(NTP_SERVER);

  unsigned long start = millis();
  while (time(nullptr) < 1000000000L && millis() - start < 5000) {
    delay(200);
  }

  if (time(nullptr) > 1000000000L) {
    Serial.print("[NTP] time set: ");
    Serial.println((unsigned long)time(nullptr));
  } else {
    Serial.println("[NTP] sync timeout, using boot epoch fallback");
  }
}

uint32_t unixNow() {
  time_t t = time(nullptr);
  if (t > 1000000000L) {
    return (uint32_t)t;
  }
  return (uint32_t)(millis() / 1000) + BOOT_EPOCH;
}
