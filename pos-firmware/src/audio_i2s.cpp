#include "audio_i2s.h"

#include "config.h"
#include "display.h"

#include <Arduino.h>

#if defined(BOARD_ESP32_S3) && defined(AUDIO_ENABLE)

#include <driver/i2s.h>
#include <driver/gpio.h>
#include <esp_heap_caps.h>
#include <limits.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <Wire.h>

static bool audio_ready = false;
static bool mic_i2s_installed = false;
static bool speaker_i2s_installed = false;

#if defined(AUDIO_ENABLE)
static int16_t* voice_buffer = nullptr;
static size_t voice_recorded_samples = 0;
static bool voice_recording = false;
static bool voice_playing = false;
static uint32_t voice_record_peak = 0;
static unsigned long voice_record_started_ms = 0;
static unsigned long voice_last_log_ms = 0;
#endif

static i2s_channel_t micClkChannels(i2s_channel_fmt_t channel_fmt) {
  if (channel_fmt == I2S_CHANNEL_FMT_RIGHT_LEFT) {
    return I2S_CHANNEL_STEREO;
  }
  return I2S_CHANNEL_MONO;
}

static void uninstallMicSafe() {
  if (!mic_i2s_installed) {
    return;
  }
  i2s_driver_uninstall(I2S_NUM_0);
  mic_i2s_installed = false;
}

static bool installMicRxOnPinsEx(
    uint8_t bclk,
    uint8_t ws,
    uint8_t sd,
    i2s_comm_format_t comm_fmt,
    i2s_channel_fmt_t channel_fmt,
    i2s_bits_per_sample_t bits_per_sample) {
  uninstallMicSafe();

  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = AUDIO_SAMPLE_RATE_HZ;
  cfg.bits_per_sample = bits_per_sample;
  cfg.channel_format = channel_fmt;
  cfg.communication_format = comm_fmt;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = false;
  cfg.fixed_mclk = 0;

  esp_err_t err = i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO] mic driver install failed: %d\n", (int)err);
    return false;
  }

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = bclk;
  pins.ws_io_num = ws;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = sd;

  err = i2s_set_pin(I2S_NUM_0, &pins);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO] mic set_pin failed (BCLK=%u WS=%u SD=%u): %d\n", bclk, ws, sd, (int)err);
    i2s_driver_uninstall(I2S_NUM_0);
    return false;
  }

  i2s_zero_dma_buffer(I2S_NUM_0);
  i2s_set_clk(
      I2S_NUM_0,
      AUDIO_SAMPLE_RATE_HZ,
      bits_per_sample,
      micClkChannels(channel_fmt));
  mic_i2s_installed = true;
  return true;
}

static bool installMicRxOnPins(uint8_t bclk, uint8_t ws, uint8_t sd) {
  // Production path: 16-bit I2S like esp32-inmp441- reference (RIGHT slot on this board).
  return installMicRxOnPinsEx(
      bclk,
      ws,
      sd,
      I2S_COMM_FORMAT_STAND_I2S,
      I2S_CHANNEL_FMT_ONLY_RIGHT,
      I2S_BITS_PER_SAMPLE_16BIT);
}

static bool installMicRx() {
  return installMicRxOnPins(I2S_MIC_BCLK_PIN, I2S_MIC_WS_PIN, I2S_MIC_SD_PIN);
}

static bool reinstallMicRx() {
  return installMicRx();
}

static void uninstallSpeakerSafe() {
  if (!speaker_i2s_installed) {
    return;
  }
  i2s_driver_uninstall(I2S_NUM_1);
  speaker_i2s_installed = false;
}

static bool installSpeakerTx() {
  uninstallSpeakerSafe();

  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = AUDIO_SAMPLE_RATE_HZ;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = true;
  cfg.fixed_mclk = 0;

  esp_err_t err = i2s_driver_install(I2S_NUM_1, &cfg, 0, nullptr);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO] speaker driver install failed: %d\n", (int)err);
    return false;
  }

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_SPK_BCLK_PIN;
  pins.ws_io_num = I2S_SPK_WS_PIN;
  pins.data_out_num = I2S_SPK_DIN_PIN;
  pins.data_in_num = I2S_PIN_NO_CHANGE;

  err = i2s_set_pin(I2S_NUM_1, &pins);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO] speaker set_pin failed: %d\n", (int)err);
    i2s_driver_uninstall(I2S_NUM_1);
    return false;
  }

  i2s_zero_dma_buffer(I2S_NUM_1);
  speaker_i2s_installed = true;
  return true;
}

static void beginSpeakerPlayback() {
  if (!speaker_i2s_installed && !installSpeakerTx()) {
    return;
  }
  i2s_zero_dma_buffer(I2S_NUM_1);
}

enum class MicWireVerdict {
  NOT_CONNECTED,
  STUCK_LINE,
  IDLE_NOISE,
  ACTIVE,
  NO_I2S_DATA,
};

struct MicPinSet {
  uint8_t bclk;
  uint8_t ws;
  uint8_t sd;
  const char* label;
};

static void drainMic(size_t samples) {
  static int16_t scratch[256];
  size_t remaining = samples;
  while (remaining > 0) {
    size_t chunk = remaining > 256 ? 256 : remaining;
    size_t bytes_read = 0;
    i2s_read(I2S_NUM_0, scratch, chunk * sizeof(int16_t), &bytes_read, pdMS_TO_TICKS(10));
    if (bytes_read == 0) {
      break;
    }
    remaining -= bytes_read / sizeof(int16_t);
  }
}

struct MicLevelStats {
  uint32_t peak;
  uint32_t mean_abs;
  int16_t min_pcm;
  int16_t max_pcm;
  int32_t min_raw;
  int32_t max_raw;
  size_t samples;
};

static void statsFromPcm(MicLevelStats* stats, const int16_t* buf, size_t samples) {
  if (stats == nullptr || buf == nullptr || samples == 0) {
    return;
  }
  stats->samples = samples;
  stats->peak = 0;
  stats->mean_abs = 0;
  stats->min_pcm = 32767;
  stats->max_pcm = -32768;

  uint64_t sum_abs = 0;
  for (size_t i = 0; i < samples; i++) {
    int16_t s = buf[i];
    int32_t a = s < 0 ? -s : s;
    if ((uint32_t)a > stats->peak) {
      stats->peak = (uint32_t)a;
    }
    sum_abs += (uint32_t)a;
    if (s < stats->min_pcm) {
      stats->min_pcm = s;
    }
    if (s > stats->max_pcm) {
      stats->max_pcm = s;
    }
  }
  stats->mean_abs = (uint32_t)(sum_abs / samples);
}

static bool micHasSignal(const MicLevelStats* stats) {
  if (stats == nullptr || stats->samples == 0) {
    return false;
  }
  return stats->peak >= AUDIO_MIC_SIGNAL_PEAK_THRESHOLD;
}

static void logMicStats(const char* label, const MicLevelStats* stats) {
  if (stats == nullptr) {
    return;
  }
  const char* status = micHasSignal(stats) ? "SIGNAL" : "SILENT";
  Serial.printf(
      "[AUDIO] %s: %s peak=%u mean=%u pcm=[%d,%d] raw32=[%ld,%ld] samples=%u\n",
      label,
      status,
      (unsigned)stats->peak,
      (unsigned)stats->mean_abs,
      (int)stats->min_pcm,
      (int)stats->max_pcm,
      (long)stats->min_raw,
      (long)stats->max_raw,
      (unsigned)stats->samples);
  if (!micHasSignal(stats)) {
    if (stats->peak == 0 && stats->min_raw == 0 && stats->max_raw == 0) {
      Serial.println("[AUDIO] hint: all-zero I2S — mic likely not powered or SD/BCLK/WS not wired");
      Serial.println("[AUDIO]       check: VDD→3.3V, GND, SCK→GPIO13, WS→GPIO14, SD→GPIO21, L/R→GND");
    } else {
      Serial.println("[AUDIO] hint: low mic energy — speak closer or check L/R→GND");
    }
  }
}

static bool readMicChunk(int16_t* buf, size_t samples, MicLevelStats* raw_stats) {
  if (!audio_ready || buf == nullptr || samples == 0) {
    return false;
  }

  size_t recorded = 0;
  int16_t pcm_min = 32767;
  int16_t pcm_max = -32768;

  while (recorded < samples) {
    size_t want = samples - recorded;
    if (want > AUDIO_I2S_BUFFER_SAMPLES) {
      want = AUDIO_I2S_BUFFER_SAMPLES;
    }

    size_t bytes_read = 0;
    esp_err_t err = i2s_read(
        I2S_NUM_0,
        buf + recorded,
        want * sizeof(int16_t),
        &bytes_read,
        portMAX_DELAY);
    if (err != ESP_OK || bytes_read == 0) {
      Serial.printf("[AUDIO] mic read failed at %u/%u err=%d\n", (unsigned)recorded, (unsigned)samples, (int)err);
      return false;
    }

    size_t got = bytes_read / sizeof(int16_t);
    for (size_t i = 0; i < got; i++) {
      int16_t s = buf[recorded + i];
      if (s < pcm_min) {
        pcm_min = s;
      }
      if (s > pcm_max) {
        pcm_max = s;
      }
    }
    recorded += got;
  }

  if (raw_stats != nullptr) {
    raw_stats->min_raw = pcm_min;
    raw_stats->max_raw = pcm_max;
  }
  return true;
}

static const char* verdictText(MicWireVerdict v) {
  switch (v) {
    case MicWireVerdict::NOT_CONNECTED:
      return "NOT CONNECTED (all zeros — no I2S data on SD)";
    case MicWireVerdict::NO_I2S_DATA:
      return "NO I2S BYTES (driver read returned nothing)";
    case MicWireVerdict::STUCK_LINE:
      return "STUCK LINE (constant value — check SD wire)";
    case MicWireVerdict::IDLE_NOISE:
      return "LIKELY CONNECTED (idle noise, quiet room)";
    case MicWireVerdict::ACTIVE:
      return "CONNECTED + ACTIVE (mic is sending audio)";
    default:
      return "UNKNOWN";
  }
}

static void scanI2cBus(uint8_t sda, uint8_t scl) {
  Serial.printf("[DETECT] I2C scan SDA=GPIO%u SCL=GPIO%u\n", sda, scl);
  Wire.begin(sda, scl);
  delay(20);

  uint8_t found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      found++;
      Serial.printf("[DETECT]   I2C device @ 0x%02X", addr);
      if (addr == OLED_I2C_ADDR) {
        Serial.print(" (OLED SSD1306 expected)");
      }
      Serial.println();
    }
  }
  if (found == 0) {
    Serial.println("[DETECT]   no I2C devices found");
  } else {
    Serial.printf("[DETECT]   %u I2C device(s) total\n", found);
  }
}

static void logGpioPin(uint8_t pin, const char* label) {
  gpio_reset_pin((gpio_num_t)pin);
  gpio_set_direction((gpio_num_t)pin, GPIO_MODE_INPUT);

  gpio_set_pull_mode((gpio_num_t)pin, GPIO_PULLUP_ONLY);
  delay(10);
  int level_up = gpio_get_level((gpio_num_t)pin);

  gpio_set_pull_mode((gpio_num_t)pin, GPIO_PULLDOWN_ONLY);
  delay(10);
  int level_down = gpio_get_level((gpio_num_t)pin);

  gpio_set_pull_mode((gpio_num_t)pin, GPIO_FLOATING);
  delay(10);
  int level_float = gpio_get_level((gpio_num_t)pin);

  const char* hint = "";
  if (level_up == 1 && level_down == 1) {
    hint = " — appears tied HIGH";
  } else if (level_up == 0 && level_down == 0) {
    hint = " — appears tied LOW";
  } else if (level_up == 1 && level_down == 0) {
    hint = " — floating/open (normal for unconnected input)";
  }

  Serial.printf(
      "[DETECT] GPIO %2u %-5s pull-up=%d pull-down=%d float=%d%s\n",
      pin,
      label,
      level_up,
      level_down,
      level_float,
      hint);
}

static MicWireVerdict analyzeRawSamples(const int32_t* raw, size_t count, MicLevelStats* stats) {
  if (raw == nullptr || count == 0 || stats == nullptr) {
    return MicWireVerdict::NO_I2S_DATA;
  }

  stats->samples = count;
  stats->peak = 0;
  stats->mean_abs = 0;
  stats->min_pcm = 32767;
  stats->max_pcm = -32768;
  stats->min_raw = raw[0];
  stats->max_raw = raw[0];

  uint32_t zero_count = 0;
  uint64_t sum_abs = 0;
  int32_t prev = raw[0];
  uint32_t changes = 0;

  for (size_t i = 0; i < count; i++) {
    int32_t v = raw[i];
    int16_t pcm = (int16_t)(v >> 14);
    int32_t a = pcm < 0 ? -pcm : pcm;

    if (v == 0) {
      zero_count++;
    }
    if (v < stats->min_raw) {
      stats->min_raw = v;
    }
    if (v > stats->max_raw) {
      stats->max_raw = v;
    }
    if ((uint32_t)a > stats->peak) {
      stats->peak = (uint32_t)a;
    }
    sum_abs += (uint32_t)a;
    if (pcm < stats->min_pcm) {
      stats->min_pcm = pcm;
    }
    if (pcm > stats->max_pcm) {
      stats->max_pcm = pcm;
    }
    if (i > 0 && v != prev) {
      changes++;
    }
    prev = v;
  }

  stats->mean_abs = (uint32_t)(sum_abs / count);

  if (zero_count == count) {
    return MicWireVerdict::NOT_CONNECTED;
  }
  if (changes == 0) {
    return MicWireVerdict::STUCK_LINE;
  }
  if (stats->peak >= AUDIO_MIC_SIGNAL_PEAK_THRESHOLD) {
    return MicWireVerdict::ACTIVE;
  }
  if (stats->peak > 8 || changes > count / 8) {
    return MicWireVerdict::IDLE_NOISE;
  }
  return MicWireVerdict::NOT_CONNECTED;
}

static MicWireVerdict probeMicPinSet(const MicPinSet& pins, MicLevelStats* stats) {
  Serial.printf(
      "[DETECT] trying mic pins %s: BCLK=GPIO%u WS=GPIO%u SD=GPIO%u\n",
      pins.label,
      pins.bclk,
      pins.ws,
      pins.sd);

  uninstallMicSafe();
  if (!installMicRxOnPins(pins.bclk, pins.ws, pins.sd)) {
    Serial.println("[DETECT]   I2S install FAILED on this pin set");
    if (stats != nullptr) {
      memset(stats, 0, sizeof(*stats));
    }
    return MicWireVerdict::NO_I2S_DATA;
  }

  drainMic(256);

  static int16_t pcm_buf[AUDIO_LOOPBACK_CHUNK_SAMPLES];
  size_t bytes_read = 0;
  esp_err_t err = i2s_read(
      I2S_NUM_0,
      pcm_buf,
      sizeof(pcm_buf),
      &bytes_read,
      portMAX_DELAY);

  size_t count = bytes_read / sizeof(int16_t);
  Serial.printf("[DETECT]   i2s_read: err=%d bytes=%u samples=%u\n", (int)err, (unsigned)bytes_read, (unsigned)count);

  if (err != ESP_OK || count == 0) {
    if (stats != nullptr) {
      memset(stats, 0, sizeof(*stats));
    }
    return MicWireVerdict::NO_I2S_DATA;
  }

  Serial.print("[DETECT]   first pcm:");
  size_t preview = count > 6 ? 6 : count;
  for (size_t i = 0; i < preview; i++) {
    Serial.printf(" %d", (int)pcm_buf[i]);
  }
  Serial.println();

  MicLevelStats local = {};
  statsFromPcm(&local, pcm_buf, count);
  local.min_raw = pcm_buf[0];
  local.max_raw = pcm_buf[count / 2];

  MicWireVerdict verdict = MicWireVerdict::NOT_CONNECTED;
  if (local.peak >= AUDIO_MIC_SIGNAL_PEAK_THRESHOLD) {
    verdict = MicWireVerdict::ACTIVE;
  } else if (local.peak > 8) {
    verdict = MicWireVerdict::IDLE_NOISE;
  } else if (local.peak > 0) {
    verdict = MicWireVerdict::IDLE_NOISE;
  }
  if (stats != nullptr) {
    *stats = local;
  }

  Serial.printf(
      "[DETECT]   verdict: %s | peak=%u mean=%u pcm=[%d,%d]\n",
      verdictText(verdict),
      (unsigned)local.peak,
      (unsigned)local.mean_abs,
      (int)local.min_pcm,
      (int)local.max_pcm);
  return verdict;
}

static uint32_t peakWithShift(const int32_t* raw, size_t count, int shift) {
  uint32_t peak = 0;
  for (size_t i = 0; i < count; i++) {
    int16_t s = (int16_t)(raw[i] >> shift);
    int32_t a = s < 0 ? -s : s;
    if ((uint32_t)a > peak) {
      peak = (uint32_t)a;
    }
  }
  return peak;
}

static void bitbangSdActivityTest(uint8_t bclk, uint8_t ws, uint8_t sd) {
  Serial.printf("[DEEP] bit-bang SD activity BCLK=GPIO%u WS=GPIO%u SD=GPIO%u\n", bclk, ws, sd);

  gpio_reset_pin((gpio_num_t)bclk);
  gpio_reset_pin((gpio_num_t)ws);
  gpio_reset_pin((gpio_num_t)sd);
  gpio_set_direction((gpio_num_t)bclk, GPIO_MODE_OUTPUT);
  gpio_set_direction((gpio_num_t)ws, GPIO_MODE_OUTPUT);
  gpio_set_direction((gpio_num_t)sd, GPIO_MODE_INPUT);
  gpio_set_pull_mode((gpio_num_t)sd, GPIO_FLOATING);

  uint32_t edges = 0;
  uint32_t highs = 0;
  int last = gpio_get_level((gpio_num_t)sd);

  for (int word = 0; word < 64; word++) {
    gpio_set_level((gpio_num_t)ws, word & 1);
    for (int bit = 0; bit < 32; bit++) {
      gpio_set_level((gpio_num_t)bclk, 0);
      delayMicroseconds(5);
      gpio_set_level((gpio_num_t)bclk, 1);
      delayMicroseconds(5);
      int v = gpio_get_level((gpio_num_t)sd);
      if (v) {
        highs++;
      }
      if (v != last) {
        edges++;
      }
      last = v;
    }
  }

  Serial.printf("[DEEP]   SD edges=%u highs=%u/2048", (unsigned)edges, (unsigned)highs);
  if (edges == 0 && highs == 0) {
    Serial.println(" -> DEAD (no wire to SD or mic unpowered)");
  } else if (edges < 20) {
    Serial.println(" -> weak (SD tied static — check SCK/WS/VDD)");
  } else {
    Serial.println(" -> ACTIVE (digital data on SD pin)");
  }
}

static void logWiringMap() {
  Serial.println("[DEEP] --- expected INMP441 wiring ---");
  Serial.println("[DEEP]   VDD -> 3.3V   GND -> GND   L/R -> GND");
  Serial.printf(
      "[DEEP]   SCK -> GPIO%u (BCLK)   WS -> GPIO%u   SD -> GPIO%u\n",
      (unsigned)I2S_MIC_BCLK_PIN,
      (unsigned)I2S_MIC_WS_PIN,
      (unsigned)I2S_MIC_SD_PIN);
  Serial.println("[DEEP] --- pins used by other peripherals (avoid) ---");
  Serial.printf("[DEEP]   OLED I2C: GPIO%u SDA, GPIO%u SCL\n", (unsigned)OLED_SDA_PIN, (unsigned)OLED_SCL_PIN);
  Serial.println("[DEEP]   Keypad: GPIO 4-7 rows, GPIO 15-18 cols");
  Serial.printf(
      "[DEEP]   Speaker: GPIO%u BCLK, GPIO%u WS, GPIO%u DIN\n",
      (unsigned)I2S_SPK_BCLK_PIN,
      (unsigned)I2S_SPK_WS_PIN,
      (unsigned)I2S_SPK_DIN_PIN);
  Serial.println("[DEEP] common mistakes:");
  Serial.println("[DEEP]   SCK and WS swapped | SD on wrong GPIO | L/R floating");
  Serial.println("[DEEP]   VDD on 5V | breadboard wire not in ESP32 header");
}

static bool readRaw512(int32_t* raw, size_t* out_count) {
  drainMic(128);
  size_t bytes_read = 0;
  esp_err_t err = i2s_read(I2S_NUM_0, raw, 512 * sizeof(int32_t), &bytes_read, pdMS_TO_TICKS(800));
  size_t count = bytes_read / sizeof(int32_t);
  if (out_count != nullptr) {
    *out_count = count;
  }
  return err == ESP_OK && count > 0;
}

void audioDeepDiag() {
  Serial.println();
  Serial.println("[DEEP] ===== INMP441 deep diagnostic =====");
  Serial.println("[DEEP] Speak or tap the mic during tests 2-3.");
  logWiringMap();

  uninstallMicSafe();

  Serial.println("[DEEP] --- test 1: bit-bang clock (checks SD wire + mic power) ---");
  static const MicPinSet pin_sets[] = {
      {I2S_MIC_BCLK_PIN, I2S_MIC_WS_PIN, I2S_MIC_SD_PIN, "configured"},
      {1, 2, 3, "legacy-1-2-3"},
  };
  for (size_t i = 0; i < sizeof(pin_sets) / sizeof(pin_sets[0]); i++) {
    Serial.printf("[DEEP] pin set \"%s\"\n", pin_sets[i].label);
    bitbangSdActivityTest(pin_sets[i].bclk, pin_sets[i].ws, pin_sets[i].sd);
  }

  Serial.println("[DEEP] --- test 2: I2S format sweep (512 samples each) ---");
  struct FormatProfile {
    i2s_comm_format_t comm;
    i2s_channel_fmt_t channel;
    const char* label;
  };
  static const FormatProfile formats[] = {
      {I2S_COMM_FORMAT_STAND_I2S, I2S_CHANNEL_FMT_ONLY_LEFT, "I2S-LEFT"},
      {I2S_COMM_FORMAT_STAND_I2S, I2S_CHANNEL_FMT_ONLY_RIGHT, "I2S-RIGHT"},
      {I2S_COMM_FORMAT_STAND_I2S, I2S_CHANNEL_FMT_RIGHT_LEFT, "I2S-STEREO"},
  };

  uint32_t best_peak = 0;
  const char* best_label = nullptr;

  for (size_t p = 0; p < sizeof(pin_sets) / sizeof(pin_sets[0]); p++) {
    Serial.printf("[DEEP] pin set \"%s\" (BCLK=%u WS=%u SD=%u)\n",
        pin_sets[p].label, pin_sets[p].bclk, pin_sets[p].ws, pin_sets[p].sd);
    for (size_t f = 0; f < sizeof(formats) / sizeof(formats[0]); f++) {
      if (!installMicRxOnPinsEx(
              pin_sets[p].bclk,
              pin_sets[p].ws,
              pin_sets[p].sd,
              formats[f].comm,
              formats[f].channel,
              I2S_BITS_PER_SAMPLE_32BIT)) {
        Serial.printf("[DEEP]   %-10s install FAILED\n", formats[f].label);
        continue;
      }

      static int32_t raw[512];
      size_t count = 0;
      if (!readRaw512(raw, &count)) {
        Serial.printf("[DEEP]   %-10s read FAILED\n", formats[f].label);
        continue;
      }

      uint32_t zeros = 0;
      uint32_t changes = 0;
      for (size_t i = 0; i < count; i++) {
        if (raw[i] == 0) {
          zeros++;
        }
        if (i > 0 && raw[i] != raw[i - 1]) {
          changes++;
        }
      }

      uint32_t pk11 = peakWithShift(raw, count, 11);
      uint32_t pk14 = peakWithShift(raw, count, 14);
      uint32_t pk16 = peakWithShift(raw, count, 16);
      uint32_t pk = pk14;
      if (pk11 > pk) {
        pk = pk11;
      }
      if (pk16 > pk) {
        pk = pk16;
      }

      Serial.printf(
          "[DEEP]   %-10s zeros=%u%% chg=%u peak>>11=%u >>14=%u >>16=%u raw=[%ld,%ld]\n",
          formats[f].label,
          (unsigned)((zeros * 100) / count),
          (unsigned)changes,
          (unsigned)pk11,
          (unsigned)pk14,
          (unsigned)pk16,
          (long)raw[0],
          (long)raw[count / 2]);

      if (pk > best_peak) {
        best_peak = pk;
        best_label = formats[f].label;
      }
    }
  }

  Serial.println("[DEEP] --- test 3: SD pin digital sample while I2S clocks ---");
  if (installMicRxOnPins(I2S_MIC_BCLK_PIN, I2S_MIC_WS_PIN, I2S_MIC_SD_PIN)) {
    uint32_t edges = 0;
    int last = -1;
    for (uint32_t i = 0; i < 2000; i++) {
      int v = gpio_get_level((gpio_num_t)I2S_MIC_SD_PIN);
      if (last >= 0 && v != last) {
        edges++;
      }
      last = v;
      delayMicroseconds(100);
    }
    Serial.printf("[DEEP]   SD edges while I2S running: %u\n", (unsigned)edges);
    if (edges == 0) {
      Serial.println("[DEEP]   SD pin not toggling — data not reaching GPIO21");
    }
  }

  Serial.println("[DEEP] restoring mic driver…");
  if (!reinstallMicRx()) {
    Serial.println("[DEEP] FATAL: could not restore mic I2S");
  } else {
    audio_ready = true;
    drainMic(128);
  }

  Serial.println("[DEEP] --- diagnosis ---");
  if (best_peak >= AUDIO_MIC_SIGNAL_PEAK_THRESHOLD) {
    Serial.printf("[DEEP] MIC WORKING (best peak=%u, format=%s)\n", (unsigned)best_peak, best_label ? best_label : "?");
  } else if (best_peak > 20) {
    Serial.printf(
        "[DEEP] MIC WEAKLY DETECTED (peak=%u) — try speaking louder; may need >>11 shift\n",
        (unsigned)best_peak);
  } else {
    Serial.println("[DEEP] MIC NOT WORKING — hardware issue:");
    Serial.println("[DEEP]   A) bit-bang DEAD on both pin sets -> reseat wires, check 3.3V on mic VDD");
    Serial.println("[DEEP]   B) bit-bang ACTIVE but I2S zeros -> SCK/WS swapped on module");
    Serial.println("[DEEP]   C) only legacy works -> update config.h to GPIO 1/2/3");
    Serial.println("[DEEP]   D) only RIGHT channel works -> L/R should be GND not VDD");
  }
  Serial.println("[DEEP] ===== done =====");
  Serial.println();
}

static void logSpeakerWiringMap() {
  Serial.println("[SPK] --- expected MAX98357A wiring ---");
  Serial.println("[SPK]   VIN -> 3.3V   GND -> GND");
  Serial.println("[SPK]   SD (shutdown) -> 3.3V  *** REQUIRED — amp muted if low ***");
  Serial.printf(
      "[SPK]   BCLK -> GPIO%u   LRC/WS -> GPIO%u   DIN -> GPIO%u\n",
      (unsigned)I2S_SPK_BCLK_PIN,
      (unsigned)I2S_SPK_WS_PIN,
      (unsigned)I2S_SPK_DIN_PIN);
  Serial.println("[SPK]   GAIN -> NC (default)   + / - -> speaker");
  Serial.println("[SPK] common mistakes:");
  Serial.println("[SPK]   SD left floating or on GND -> silent amp");
  Serial.println("[SPK]   BCLK/LRC/DIN swapped | speaker on wrong +/-");
  Serial.println("[SPK]   VIN on 5V (use 3.3V)");
}

static uint32_t samplePinEdges(uint8_t pin, uint32_t samples, uint32_t delay_us) {
  gpio_reset_pin((gpio_num_t)pin);
  gpio_set_direction((gpio_num_t)pin, GPIO_MODE_INPUT);
  gpio_set_pull_mode((gpio_num_t)pin, GPIO_FLOATING);

  uint32_t edges = 0;
  int last = gpio_get_level((gpio_num_t)pin);
  for (uint32_t i = 0; i < samples; i++) {
    delayMicroseconds(delay_us);
    int v = gpio_get_level((gpio_num_t)pin);
    if (v != last) {
      edges++;
    }
    last = v;
  }
  return edges;
}

static void applyMonitorGain(int16_t* buf, size_t samples);

static void fillSineTone(int16_t* buf, size_t samples, float freq_hz, int16_t amplitude, float* phase) {
  if (buf == nullptr || samples == 0 || phase == nullptr) {
    return;
  }
  const float step = (2.0f * (float)M_PI * freq_hz) / (float)AUDIO_SAMPLE_RATE_HZ;
  for (size_t i = 0; i < samples; i++) {
    buf[i] = (int16_t)((float)amplitude * sinf(*phase));
    *phase += step;
    if (*phase > 2.0f * (float)M_PI) {
      *phase -= 2.0f * (float)M_PI;
    }
  }
}

static bool speakerWriteProbe(size_t samples, size_t* bytes_written_out) {
  if (!speaker_i2s_installed || samples == 0) {
    return false;
  }

  static int16_t scratch[256];
  size_t sent = 0;
  size_t total_bytes = 0;
  while (sent < samples) {
    size_t n = samples - sent;
    if (n > sizeof(scratch) / sizeof(scratch[0])) {
      n = sizeof(scratch) / sizeof(scratch[0]);
    }
    memset(scratch, 0, n * sizeof(int16_t));

    size_t bytes_written = 0;
    esp_err_t err = i2s_write(I2S_NUM_1, scratch, n * sizeof(int16_t), &bytes_written, portMAX_DELAY);
    if (err != ESP_OK || bytes_written == 0) {
      Serial.printf("[SPK]   i2s_write failed at sample %u err=%d\n", (unsigned)sent, (int)err);
      return false;
    }
    sent += bytes_written / sizeof(int16_t);
    total_bytes += bytes_written;
    drainMic(bytes_written / sizeof(int16_t));
  }

  if (bytes_written_out != nullptr) {
    *bytes_written_out = total_bytes;
  }
  return true;
}

static bool playSineTone(float freq_hz, uint32_t duration_ms, int16_t amplitude) {
  if (!speaker_i2s_installed) {
    return false;
  }

  beginSpeakerPlayback();

  size_t total_samples = ((size_t)duration_ms * AUDIO_SAMPLE_RATE_HZ) / 1000;
  if (total_samples == 0) {
    return false;
  }

  static int16_t chunk[AUDIO_I2S_BUFFER_SAMPLES];
  float phase = 0.0f;
  size_t played = 0;
  while (played < total_samples) {
    size_t n = total_samples - played;
    if (n > sizeof(chunk) / sizeof(chunk[0])) {
      n = sizeof(chunk) / sizeof(chunk[0]);
    }
    fillSineTone(chunk, n, freq_hz, amplitude, &phase);
    if (!audioPlayMono16k(chunk, n)) {
      return false;
    }
    played += n;
  }
  return true;
}

void audioSpeakerDiag() {
  if (!audio_ready) {
    Serial.println("[SPK] audio not initialized");
    return;
  }

  Serial.println();
  Serial.println("[SPK] ===== MAX98357A speaker diagnostic =====");
  Serial.println("[SPK] Listen for beeps during test 3.");
  showVoiceStatusScreen("Speaker test", "Listen for beeps");
  logSpeakerWiringMap();

  bool driver_ok = speaker_i2s_installed;
  Serial.printf("[SPK] --- test 1: I2S TX driver ---\n");
  Serial.printf("[SPK]   speaker driver installed: %s\n", driver_ok ? "yes" : "NO");

  Serial.println("[SPK] --- test 2: GPIO line check (I2S paused) ---");
  uninstallSpeakerSafe();
  logGpioPin(I2S_SPK_BCLK_PIN, "SPK-BCLK");
  logGpioPin(I2S_SPK_WS_PIN, "SPK-WS");
  logGpioPin(I2S_SPK_DIN_PIN, "SPK-DIN");

  if (!installSpeakerTx()) {
    Serial.println("[SPK] FATAL: could not install speaker I2S driver");
    showProductSelectScreen();
    return;
  }

  Serial.println("[SPK] --- test 3: I2S write probe (silence) ---");
  size_t bytes_written = 0;
  bool write_ok = speakerWriteProbe(512, &bytes_written);
  Serial.printf("[SPK]   i2s_write 512 samples: %s (%u bytes)\n", write_ok ? "OK" : "FAILED", (unsigned)bytes_written);

  Serial.println("[SPK] --- test 4: audible tone (880 Hz, 1.0s) ---");
  showVoiceStatusScreen("Beep test", "880 Hz tone");
  bool tone880 = playSineTone(880.0f, 1000, 16000);
  Serial.printf("[SPK]   880 Hz tone: %s\n", tone880 ? "sent to I2S" : "FAILED");

  Serial.println("[SPK] --- test 5: audible tone (440 Hz, 1.0s) ---");
  showVoiceStatusScreen("Beep test", "440 Hz tone");
  bool tone440 = playSineTone(440.0f, 1000, 16000);
  Serial.printf("[SPK]   440 Hz tone: %s\n", tone440 ? "sent to I2S" : "FAILED");

  Serial.println("[SPK] --- diagnosis ---");
  if (write_ok && tone880 && tone440) {
    Serial.println("[SPK] I2S SPEAKER PATH OK — software is sending audio to GPIO10/11/12");
    Serial.println("[SPK] If you heard NO beeps:");
    Serial.println("[SPK]   1) Tie MAX98357A SD pin to 3.3V (most common fix)");
    Serial.println("[SPK]   2) Check speaker wires on + and - terminals");
    Serial.println("[SPK]   3) Verify VIN=3.3V and shared GND");
    Serial.println("[SPK]   4) Swap BCLK/LRC if garbled but not silent");
  } else {
    Serial.println("[SPK] SPEAKER I2S NOT WORKING — driver or write failure");
    Serial.println("[SPK]   check GPIO 10/11/12 wiring and reboot");
  }
  Serial.println("[SPK] ===== done =====");
  Serial.println();
  showProductSelectScreen();
}

void audioDetectHardware() {
  Serial.println();
  Serial.println("[DETECT] ===== hardware scan =====");
  Serial.println("[DETECT] Note: INMP441 is I2S (not I2C/USB) — there is no address to enumerate.");
  Serial.println("[DETECT] We scan I2C for OLED, check GPIO lines, and probe I2S pin sets.");

  scanI2cBus(OLED_SDA_PIN, OLED_SCL_PIN);

  Serial.println("[DETECT] --- GPIO line check (mic must be unwired from I2S for accurate SD test) ---");
  Serial.println("[DETECT] pausing mic I2S driver for GPIO reads…");
  bool was_ready = audio_ready;
  if (was_ready) {
    uninstallMicSafe();
    audio_ready = false;
    delay(20);
  }

  logGpioPin(I2S_MIC_BCLK_PIN, "BCLK");
  logGpioPin(I2S_MIC_WS_PIN, "WS");
  logGpioPin(I2S_MIC_SD_PIN, "SD");
  logGpioPin(I2S_SPK_BCLK_PIN, "SPK-BCLK");
  logGpioPin(I2S_SPK_WS_PIN, "SPK-WS");
  logGpioPin(I2S_SPK_DIN_PIN, "SPK-DIN");

  Serial.println("[DETECT] --- I2S mic pin-set probe (512 samples each) ---");
  Serial.println("[DETECT] tap/speak near mic during this scan…");

  static const MicPinSet candidates[] = {
      {I2S_MIC_BCLK_PIN, I2S_MIC_WS_PIN, I2S_MIC_SD_PIN, "configured"},
      {1, 2, 3, "legacy-1-2-3"},
      {19, 20, 21, "alt-19-20-21"},
      {40, 41, 42, "alt-40-41-42"},
  };

  MicWireVerdict best = MicWireVerdict::NOT_CONNECTED;
  const MicPinSet* best_pins = nullptr;
  MicLevelStats best_stats = {};

  for (size_t i = 0; i < sizeof(candidates) / sizeof(candidates[0]); i++) {
    MicLevelStats stats = {};
    MicWireVerdict v = probeMicPinSet(candidates[i], &stats);

    bool better = false;
    if (v == MicWireVerdict::ACTIVE && best != MicWireVerdict::ACTIVE) {
      better = true;
    } else if (v == MicWireVerdict::IDLE_NOISE && best != MicWireVerdict::ACTIVE && best != MicWireVerdict::IDLE_NOISE) {
      better = true;
    } else if (v == MicWireVerdict::STUCK_LINE && best == MicWireVerdict::NOT_CONNECTED) {
      better = true;
    } else if (v != MicWireVerdict::NOT_CONNECTED && v != MicWireVerdict::NO_I2S_DATA && stats.peak > best_stats.peak) {
      better = true;
    }

    if (better) {
      best = v;
      best_pins = &candidates[i];
      best_stats = stats;
    }
  }

  Serial.println("[DETECT] restoring configured mic driver…");
  if (!reinstallMicRx()) {
    Serial.println("[DETECT] FATAL: could not restore mic I2S driver");
  } else {
    audio_ready = true;
    drainMic(128);
  }

  Serial.println("[DETECT] --- summary ---");
  if (best_pins != nullptr &&
      (best == MicWireVerdict::ACTIVE || best == MicWireVerdict::IDLE_NOISE || best == MicWireVerdict::STUCK_LINE)) {
    Serial.printf(
        "[DETECT] MIC FOUND on pin set \"%s\" (BCLK=%u WS=%u SD=%u)\n",
        best_pins->label,
        best_pins->bclk,
        best_pins->ws,
        best_pins->sd);
    Serial.printf("[DETECT] status: %s\n", verdictText(best));
    if (best_pins->bclk != I2S_MIC_BCLK_PIN || best_pins->ws != I2S_MIC_WS_PIN || best_pins->sd != I2S_MIC_SD_PIN) {
      Serial.println("[DETECT] ACTION: your wiring matches a different pin set than firmware config!");
      Serial.println("[DETECT]         rewire to GPIO 13/14/21 OR ask to update config.h to match.");
    }
  } else {
    Serial.println("[DETECT] MIC NOT DETECTED on any tried pin set.");
    Serial.println("[DETECT] checklist:");
    Serial.println("[DETECT]   1) INMP441 VDD → 3.3V (not 5V), GND → GND");
    Serial.println("[DETECT]   2) SCK→BCLK, WS→WS/LRCK, SD→data (do not swap SCK/WS)");
    Serial.println("[DETECT]   3) L/R pin → GND");
    Serial.println("[DETECT]   4) firmware expects BCLK=GPIO13 WS=GPIO14 SD=GPIO21");
    Serial.println("[DETECT]   5) use a multimeter: 3.3V between VDD and GND on mic module");
  }
  Serial.println("[DETECT] ===== scan done =====");
  Serial.println();
}

bool audioInit() {
  if (audio_ready) {
    return true;
  }

  if (!installMicRx()) {
    return false;
  }
  if (!installSpeakerTx()) {
    uninstallMicSafe();
    return false;
  }

  drainMic(256);
  voice_buffer = (int16_t*)heap_caps_malloc(
      AUDIO_VOICE_MAX_SAMPLES * sizeof(int16_t),
      MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (voice_buffer == nullptr) {
    Serial.println("[AUDIO] PSRAM voice buffer failed, trying internal RAM...");
    voice_buffer = (int16_t*)heap_caps_malloc(
        AUDIO_VOICE_MAX_SAMPLES * sizeof(int16_t),
        MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  }
  if (voice_buffer == nullptr) {
    Serial.println("[AUDIO] voice buffer alloc FAILED — out of RAM");
    uninstallMicSafe();
    return false;
  }
  Serial.printf("[AUDIO] voice buffer %u bytes in %s\n",
      (unsigned)(AUDIO_VOICE_MAX_SAMPLES * sizeof(int16_t)),
      esp_ptr_external_ram(voice_buffer) ? "PSRAM" : "internal RAM");

  audio_ready = true;
  Serial.println("[AUDIO] mic+speaker init OK (16-bit I2S passthrough model)");
  Serial.printf(
      "[AUDIO] pins mic BCLK=%u WS=%u SD=%u (I2S RIGHT) | spk BCLK=%u WS=%u DIN=%u @ %u Hz\n",
      (unsigned)I2S_MIC_BCLK_PIN,
      (unsigned)I2S_MIC_WS_PIN,
      (unsigned)I2S_MIC_SD_PIN,
      (unsigned)I2S_SPK_BCLK_PIN,
      (unsigned)I2S_SPK_WS_PIN,
      (unsigned)I2S_SPK_DIN_PIN,
      (unsigned)AUDIO_SAMPLE_RATE_HZ);
  Serial.println("[AUDIO] serial: P=deep diag  D=quick scan  M=mic probe  L=loopback  S=speaker");
  Serial.println("[AUDIO] keypad: A=record  B=play back  C=speaker test");
  Serial.printf("[AUDIO] voice buffer: %u s (%u samples)\n",
      (unsigned)AUDIO_VOICE_RECORD_MAX_SEC,
      (unsigned)AUDIO_VOICE_MAX_SAMPLES);
  Serial.printf("[AUDIO] mic status logs every %u ms when idle\n", (unsigned)AUDIO_MIC_STATUS_LOG_INTERVAL_MS);
  return true;
}

bool audioIsReady() {
  return audio_ready;
}

static void applyMonitorGain(int16_t* buf, size_t samples) {
  if (buf == nullptr || samples == 0) {
    return;
  }
  for (size_t i = 0; i < samples; i++) {
    int32_t v = (int32_t)buf[i] * AUDIO_MONITOR_GAIN;
    if (v > 32767) {
      v = 32767;
    } else if (v < -32768) {
      v = -32768;
    }
    buf[i] = (int16_t)v;
  }
}

static void applyVoicePlaybackGain(int16_t* buf, size_t samples, uint32_t source_peak) {
  if (buf == nullptr || samples == 0) {
    return;
  }

  uint32_t peak = source_peak;
  if (peak < AUDIO_VOICE_PLAYBACK_MIN_PEAK) {
    peak = AUDIO_VOICE_PLAYBACK_MIN_PEAK;
  }

  for (size_t i = 0; i < samples; i++) {
    int32_t v = ((int32_t)buf[i] * (int32_t)AUDIO_VOICE_PLAYBACK_TARGET_PEAK) / (int32_t)peak;
    if (v > 32767) {
      v = 32767;
    } else if (v < -32768) {
      v = -32768;
    }
    buf[i] = (int16_t)v;
  }
}

static void audioVoiceRecordPump() {
  if (!voice_recording || voice_buffer == nullptr) {
    return;
  }

  static int16_t chunk[AUDIO_I2S_BUFFER_SAMPLES];
  constexpr size_t kSamples = sizeof(chunk) / sizeof(chunk[0]);

  MicLevelStats raw = {};
  if (!readMicChunk(chunk, kSamples, &raw)) {
    if (millis() - voice_last_log_ms >= AUDIO_VOICE_LOG_INTERVAL_MS) {
      voice_last_log_ms = millis();
      Serial.println("[VOICE] mic read failed while recording");
    }
    return;
  }

  MicLevelStats pcm = {};
  statsFromPcm(&pcm, chunk, kSamples);
  pcm.min_raw = raw.min_raw;
  pcm.max_raw = raw.max_raw;

  if (pcm.peak > voice_record_peak) {
    voice_record_peak = pcm.peak;
  }

  size_t space = AUDIO_VOICE_MAX_SAMPLES - voice_recorded_samples;
  size_t to_copy = kSamples;
  if (to_copy > space) {
    to_copy = space;
  }
  if (to_copy > 0) {
    memcpy(voice_buffer + voice_recorded_samples, chunk, to_copy * sizeof(int16_t));
    voice_recorded_samples += to_copy;
  }

  if (voice_recorded_samples >= AUDIO_VOICE_MAX_SAMPLES) {
    voice_recording = false;
    Serial.printf("[VOICE] RECORD FULL — buffer limit reached (%u samples, peak=%u)\n",
        (unsigned)voice_recorded_samples,
        (unsigned)voice_record_peak);
    return;
  }

  if (millis() - voice_last_log_ms >= AUDIO_VOICE_LOG_INTERVAL_MS) {
    voice_last_log_ms = millis();
    unsigned long elapsed = millis() - voice_record_started_ms;
    const char* status = micHasSignal(&pcm) ? "SIGNAL" : "quiet";
    Serial.printf("[VOICE] recording… %lu ms, %u/%u samples, %s peak=%u\n",
        elapsed,
        (unsigned)voice_recorded_samples,
        (unsigned)AUDIO_VOICE_MAX_SAMPLES,
        status,
        (unsigned)voice_record_peak);
  }
}

static unsigned long lastMicStatusLogMs = 0;

bool audioVoiceIsRecording() {
  return voice_recording;
}

void audioVoiceStartRecord() {
  if (!audio_ready || voice_buffer == nullptr) {
    Serial.println("[VOICE] not initialized");
    return;
  }
  if (voice_playing) {
    Serial.println("[VOICE] busy playing — wait for playback to finish");
    return;
  }

  voice_recording = true;
  voice_recorded_samples = 0;
  voice_record_peak = 0;
  voice_record_started_ms = millis();
  voice_last_log_ms = voice_record_started_ms;
  drainMic(128);

  Serial.println("[VOICE] RECORD START — speak into mic (press B to play back)");
  showVoiceStatusScreen("Recording…", "Press B to play");
  Serial.printf("[VOICE] max duration %.1f s (%u samples)\n",
      (float)AUDIO_VOICE_RECORD_MAX_SEC,
      (unsigned)AUDIO_VOICE_MAX_SAMPLES);
}

void audioVoicePlayRecorded() {
  if (!audio_ready || voice_buffer == nullptr) {
    Serial.println("[VOICE] not initialized");
    return;
  }
  if (voice_playing) {
    Serial.println("[VOICE] already playing");
    return;
  }

  if (voice_recording) {
    unsigned long elapsed = millis() - voice_record_started_ms;
    voice_recording = false;
    for (int i = 0; i < 4; i++) {
      audioVoiceRecordPump();
    }
    Serial.printf("[VOICE] RECORD STOP — captured %u samples in %lu ms (peak=%u)\n",
        (unsigned)voice_recorded_samples,
        elapsed,
        (unsigned)voice_record_peak);
  }

  if (voice_recorded_samples == 0) {
    Serial.println("[VOICE] nothing to play — press A first and speak");
    return;
  }

  if (voice_record_peak < AUDIO_MIC_SIGNAL_PEAK_THRESHOLD) {
    Serial.printf(
        "[VOICE] WARN: recorded peak=%u is low — speak closer/louder into mic\n",
        (unsigned)voice_record_peak);
  }

  float seconds = (float)voice_recorded_samples / (float)AUDIO_SAMPLE_RATE_HZ;
  Serial.printf("[VOICE] PLAYBACK START — %u samples (%.2f s, normalize to peak %u)\n",
      (unsigned)voice_recorded_samples,
      seconds,
      (unsigned)AUDIO_VOICE_PLAYBACK_TARGET_PEAK);
  showVoiceStatusScreen("Playing…", "Voice playback");

  beginSpeakerPlayback();
  voice_playing = true;
  size_t played = 0;
  static int16_t play_chunk[256];
  uint32_t play_peak = 0;

  while (played < voice_recorded_samples) {
    size_t n = voice_recorded_samples - played;
    if (n > sizeof(play_chunk) / sizeof(play_chunk[0])) {
      n = sizeof(play_chunk) / sizeof(play_chunk[0]);
    }

    memcpy(play_chunk, voice_buffer + played, n * sizeof(int16_t));
    applyVoicePlaybackGain(play_chunk, n, voice_record_peak);

    for (size_t i = 0; i < n; i++) {
      int32_t a = play_chunk[i] < 0 ? -play_chunk[i] : play_chunk[i];
      if ((uint32_t)a > play_peak) {
        play_peak = (uint32_t)a;
      }
    }

    if (!audioPlayMono16k(play_chunk, n)) {
      Serial.printf("[VOICE] PLAYBACK FAIL at sample %u\n", (unsigned)played);
      voice_playing = false;
      return;
    }
    played += n;
  }

  voice_playing = false;
  Serial.printf("[VOICE] PLAYBACK DONE — peak=%u\n", (unsigned)play_peak);
  showProductSelectScreen();
}

void audioLoop() {
  if (!audio_ready) {
    return;
  }

  if (voice_playing) {
    return;
  }

  if (voice_recording) {
    audioVoiceRecordPump();
    return;
  }

  static int16_t chunk[128];
  constexpr size_t kSamples = sizeof(chunk) / sizeof(chunk[0]);

  MicLevelStats raw = {};
  if (!readMicChunk(chunk, kSamples, &raw)) {
    return;
  }

  MicLevelStats pcm = {};
  statsFromPcm(&pcm, chunk, kSamples);
  pcm.min_raw = raw.min_raw;
  pcm.max_raw = raw.max_raw;

  if (millis() - lastMicStatusLogMs < AUDIO_MIC_STATUS_LOG_INTERVAL_MS) {
    return;
  }
  lastMicStatusLogMs = millis();

  const char* status = micHasSignal(&pcm) ? "SIGNAL" : "SILENT";
  Serial.printf(
      "[MIC] idle %s peak=%u — press A to record, B to play\n",
      status,
      (unsigned)pcm.peak);
}

bool audioRecordMono16k(int16_t* buf, size_t samples) {
  if (!audio_ready || buf == nullptr || samples == 0) {
    return false;
  }

  drainMic(128);
  return readMicChunk(buf, samples, nullptr);
}

bool audioPlayMono16k(const int16_t* buf, size_t samples) {
  if (!audio_ready || buf == nullptr || samples == 0) {
    return false;
  }
  if (!speaker_i2s_installed && !installSpeakerTx()) {
    return false;
  }

  size_t played = 0;
  while (played < samples) {
    size_t chunk = samples - played;
    if (chunk > AUDIO_I2S_BUFFER_SAMPLES) {
      chunk = AUDIO_I2S_BUFFER_SAMPLES;
    }

    size_t bytes_written = 0;
    esp_err_t err = i2s_write(
        I2S_NUM_1,
        buf + played,
        chunk * sizeof(int16_t),
        &bytes_written,
        portMAX_DELAY);
    if (err != ESP_OK || bytes_written == 0) {
      Serial.printf("[AUDIO] speaker write failed at %u/%u err=%d\n", (unsigned)played, (unsigned)samples, (int)err);
      return false;
    }

    size_t samples_written = bytes_written / sizeof(int16_t);
    played += samples_written;
    drainMic(samples_written);
  }

  return true;
}

bool audioProbeMic(uint32_t duration_ms) {
  if (!audio_ready) {
    Serial.println("[AUDIO] mic probe: not initialized");
    return false;
  }
  if (duration_ms == 0) {
    duration_ms = 300;
  }
  if (duration_ms > 2000) {
    duration_ms = 2000;
  }

  static int16_t chunk[AUDIO_LOOPBACK_CHUNK_SAMPLES];
  size_t total_samples = ((size_t)duration_ms * AUDIO_SAMPLE_RATE_HZ) / 1000;
  if (total_samples < AUDIO_LOOPBACK_CHUNK_SAMPLES) {
    total_samples = AUDIO_LOOPBACK_CHUNK_SAMPLES;
  }

  MicLevelStats overall = {};
  overall.min_pcm = 32767;
  overall.max_pcm = -32768;
  overall.min_raw = INT32_MAX;
  overall.max_raw = INT32_MIN;

  size_t done = 0;
  uint32_t chunk_index = 0;
  uint32_t signal_chunks = 0;

  Serial.printf("[AUDIO] mic probe %lums (%u samples)…\n", (unsigned long)duration_ms, (unsigned)total_samples);

  while (done < total_samples) {
    size_t n = total_samples - done;
    if (n > AUDIO_LOOPBACK_CHUNK_SAMPLES) {
      n = AUDIO_LOOPBACK_CHUNK_SAMPLES;
    }

    MicLevelStats raw = {};
    if (!readMicChunk(chunk, n, &raw)) {
      return false;
    }

    MicLevelStats pcm = {};
    statsFromPcm(&pcm, chunk, n);
    pcm.min_raw = raw.min_raw;
    pcm.max_raw = raw.max_raw;
    pcm.samples = n;

    if (micHasSignal(&pcm)) {
      signal_chunks++;
    }
    if (pcm.peak > overall.peak) {
      overall.peak = pcm.peak;
    }
    overall.mean_abs = (overall.mean_abs * done + pcm.mean_abs * n) / (done + n);
    if (pcm.min_pcm < overall.min_pcm) {
      overall.min_pcm = pcm.min_pcm;
    }
    if (pcm.max_pcm > overall.max_pcm) {
      overall.max_pcm = pcm.max_pcm;
    }
    if (pcm.min_raw < overall.min_raw) {
      overall.min_raw = pcm.min_raw;
    }
    if (pcm.max_raw > overall.max_raw) {
      overall.max_raw = pcm.max_raw;
    }
    overall.samples += n;

    if ((chunk_index % 4) == 0) {
      logMicStats("mic live", &pcm);
    }

    done += n;
    chunk_index++;
  }

  logMicStats("mic probe summary", &overall);
  Serial.printf(
      "[AUDIO] mic probe: %u/%u chunks had signal (threshold peak>=%u)\n",
      (unsigned)signal_chunks,
      (unsigned)chunk_index,
      (unsigned)AUDIO_MIC_SIGNAL_PEAK_THRESHOLD);
  return micHasSignal(&overall);
}

bool audioLoopbackTest(uint32_t seconds) {
  if (!audio_ready) {
    Serial.println("[AUDIO] not initialized");
    return false;
  }
  if (seconds == 0) {
    seconds = AUDIO_LOOPBACK_DEFAULT_SEC;
  }
  if (seconds > 3) {
    seconds = 3;
  }

  static int16_t buffer[AUDIO_I2S_BUFFER_SAMPLES];
  size_t total_samples = (size_t)seconds * AUDIO_SAMPLE_RATE_HZ;
  size_t done = 0;

  Serial.printf(
      "[AUDIO] loopback %lus (%u samples) — reference passthrough mode\n",
      (unsigned long)seconds,
      (unsigned)total_samples);

  beginSpeakerPlayback();
  drainMic(512);

  uint32_t chunk_index = 0;
  uint32_t signal_chunks = 0;
  uint32_t peak_overall = 0;

  while (done < total_samples) {
    size_t want = total_samples - done;
    if (want > AUDIO_I2S_BUFFER_SAMPLES) {
      want = AUDIO_I2S_BUFFER_SAMPLES;
    }

    size_t bytes_read = 0;
    esp_err_t read_err = i2s_read(
        I2S_NUM_0,
        buffer,
        want * sizeof(int16_t),
        &bytes_read,
        portMAX_DELAY);
    if (read_err != ESP_OK || bytes_read == 0) {
      Serial.printf("[AUDIO] loopback FAIL (read at %u err=%d)\n", (unsigned)done, (int)read_err);
      return false;
    }

    size_t n = bytes_read / sizeof(int16_t);
    MicLevelStats pcm = {};
    statsFromPcm(&pcm, buffer, n);
    pcm.samples = n;
    if (micHasSignal(&pcm)) {
      signal_chunks++;
    }
    if (pcm.peak > peak_overall) {
      peak_overall = pcm.peak;
    }
    if ((chunk_index % 8) == 0) {
      logMicStats("loopback mic in", &pcm);
    }

    uint32_t chunk_peak = pcm.peak;
    if (chunk_peak < AUDIO_VOICE_PLAYBACK_MIN_PEAK) {
      chunk_peak = AUDIO_VOICE_PLAYBACK_MIN_PEAK;
    }
    applyVoicePlaybackGain(buffer, n, chunk_peak);

    size_t bytes_written = 0;
    esp_err_t write_err = i2s_write(I2S_NUM_1, buffer, bytes_read, &bytes_written, portMAX_DELAY);
    if (write_err != ESP_OK || bytes_written != bytes_read) {
      Serial.printf(
          "[AUDIO] loopback FAIL (write at %u err=%d wrote=%u want=%u)\n",
          (unsigned)done,
          (int)write_err,
          (unsigned)bytes_written,
          (unsigned)bytes_read);
      return false;
    }

    done += n;
    chunk_index++;
  }

  Serial.printf(
      "[AUDIO] loopback mic summary: peak=%u signal_chunks=%u/%u\n",
      (unsigned)peak_overall,
      (unsigned)signal_chunks,
      (unsigned)chunk_index);
  if (signal_chunks == 0) {
    Serial.println("[AUDIO] loopback WARN: no mic signal detected during test");
  }
  Serial.println("[AUDIO] loopback OK");
  return true;
}

#else

bool audioInit() {
  return false;
}

bool audioIsReady() {
  return false;
}

void audioLoop() {}

bool audioRecordMono16k(int16_t* buf, size_t samples) {
  (void)buf;
  (void)samples;
  return false;
}

bool audioPlayMono16k(const int16_t* buf, size_t samples) {
  (void)buf;
  (void)samples;
  return false;
}

bool audioLoopbackTest(uint32_t seconds) {
  (void)seconds;
  return false;
}

bool audioProbeMic(uint32_t duration_ms) {
  (void)duration_ms;
  return false;
}

void audioDetectHardware() {}

void audioDeepDiag() {}

void audioSpeakerDiag() {}

void audioVoiceStartRecord() {}

void audioVoicePlayRecorded() {}

bool audioVoiceIsRecording() {
  return false;
}

#endif
