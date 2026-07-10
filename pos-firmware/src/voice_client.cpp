#include "voice_client.h"

#include "config.h"
#include "wifi_setup.h"

#if defined(AUDIO_ENABLE)

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_heap_caps.h>
#include <mbedtls/base64.h>
#include <string.h>

#ifndef VOICE_QUERY_URL
#define VOICE_QUERY_URL ""
#endif

#ifndef SUPABASE_ANON_KEY
#define SUPABASE_ANON_KEY ""
#endif

#ifndef POS_ID
#define POS_ID "POS-001"
#endif

static const char* kMultipartBoundary = "----MooVoiceBoundary7MA4YWxk";

static void setError(char* error_out, size_t error_len, const char* msg) {
  if (error_out == nullptr || error_len == 0) {
    return;
  }
  strncpy(error_out, msg, error_len - 1);
  error_out[error_len - 1] = '\0';
}

static void* allocPsram(size_t nbytes) {
  void* p = heap_caps_malloc(nbytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (p == nullptr) {
    p = malloc(nbytes);
  }
  return p;
}

const char* voiceUploadResultText(VoiceUploadResult result) {
  switch (result) {
    case VOICE_UPLOAD_OK:
      return "OK";
    case VOICE_UPLOAD_NOT_CONFIGURED:
      return "not configured";
    case VOICE_UPLOAD_WIFI:
      return "WiFi offline";
    case VOICE_UPLOAD_BUILD:
      return "WAV build failed";
    case VOICE_UPLOAD_HTTP:
      return "HTTP error";
    case VOICE_UPLOAD_RESPONSE:
      return "bad response";
    case VOICE_UPLOAD_DECODE:
      return "decode failed";
    default:
      return "unknown";
  }
}

void voiceBuildWavHeader(uint8_t* header44, uint32_t pcm_bytes) {
  if (header44 == nullptr) {
    return;
  }
  uint32_t chunk_size = 36 + pcm_bytes;
  memcpy(header44 + 0, "RIFF", 4);
  header44[4] = (uint8_t)(chunk_size & 0xff);
  header44[5] = (uint8_t)((chunk_size >> 8) & 0xff);
  header44[6] = (uint8_t)((chunk_size >> 16) & 0xff);
  header44[7] = (uint8_t)((chunk_size >> 24) & 0xff);
  memcpy(header44 + 8, "WAVE", 4);
  memcpy(header44 + 12, "fmt ", 4);
  header44[16] = 16;
  header44[17] = 0;
  header44[18] = 0;
  header44[19] = 0;
  header44[20] = 1;
  header44[21] = 0;
  header44[22] = 1;
  header44[23] = 0;
  uint32_t rate = AUDIO_SAMPLE_RATE_HZ;
  header44[24] = (uint8_t)(rate & 0xff);
  header44[25] = (uint8_t)((rate >> 8) & 0xff);
  header44[26] = (uint8_t)((rate >> 16) & 0xff);
  header44[27] = (uint8_t)((rate >> 24) & 0xff);
  uint32_t byte_rate = AUDIO_SAMPLE_RATE_HZ * 2;
  header44[28] = (uint8_t)(byte_rate & 0xff);
  header44[29] = (uint8_t)((byte_rate >> 8) & 0xff);
  header44[30] = (uint8_t)((byte_rate >> 16) & 0xff);
  header44[31] = (uint8_t)((byte_rate >> 24) & 0xff);
  header44[32] = 2;
  header44[33] = 0;
  header44[34] = 16;
  header44[35] = 0;
  memcpy(header44 + 36, "data", 4);
  header44[40] = (uint8_t)(pcm_bytes & 0xff);
  header44[41] = (uint8_t)((pcm_bytes >> 8) & 0xff);
  header44[42] = (uint8_t)((pcm_bytes >> 16) & 0xff);
  header44[43] = (uint8_t)((pcm_bytes >> 24) & 0xff);
}

/** Stream full HTTP body into PSRAM — avoids Arduino String / JsonDocument limits. */
static char* readHttpBody(HTTPClient& http, size_t* out_len, char* error_out, size_t error_len) {
  WiFiClient* stream = http.getStreamPtr();
  if (stream == nullptr) {
    setError(error_out, error_len, "no HTTP stream");
    return nullptr;
  }

  int content_length = http.getSize();
  static const size_t kInitialCapacity = 262144;   // 256 KiB
  static const size_t kGrowStep = 131072;         // 128 KiB
  static const size_t kMaxCapacity = 1048576;      // 1 MiB JSON cap

  size_t capacity = 0;
  if (content_length > 0) {
    capacity = (size_t)content_length + 1;
    if (capacity > kMaxCapacity) {
      capacity = kMaxCapacity;
    }
  } else {
    capacity = kInitialCapacity;
  }

  char* buf = (char*)allocPsram(capacity);
  if (buf == nullptr) {
    setError(error_out, error_len, "response alloc failed");
    return nullptr;
  }

  size_t pos = 0;
  const uint32_t deadline = millis() + 90000;

  while (millis() < deadline) {
    if (stream->available()) {
      if (pos + 1 >= capacity) {
        if (capacity >= kMaxCapacity) {
          break;
        }
        size_t grown = capacity + kGrowStep;
        if (grown > kMaxCapacity) {
          grown = kMaxCapacity;
        }
        char* bigger = (char*)allocPsram(grown);
        if (bigger == nullptr) {
          break;
        }
        memcpy(bigger, buf, pos);
        free(buf);
        buf = bigger;
        capacity = grown;
      }

      int n = stream->readBytes(buf + pos, capacity - pos - 1);
      if (n <= 0) {
        break;
      }
      pos += (size_t)n;

      if (content_length > 0 && pos >= (size_t)content_length) {
        break;
      }
    } else if (!stream->connected()) {
      break;
    } else if (content_length > 0 && pos >= (size_t)content_length) {
      break;
    } else {
      delay(1);
    }
  }

  buf[pos] = '\0';
  *out_len = pos;

  if (content_length > 0 && pos < (size_t)content_length) {
    Serial.printf("[VOICE_UPLOAD] incomplete body %u/%d bytes\n", (unsigned)pos, content_length);
    free(buf);
    setError(error_out, error_len, "truncated response");
    return nullptr;
  }

  return buf;
}

static bool jsonHasOk(const char* json) {
  return strstr(json, "\"ok\":true") != nullptr || strstr(json, "\"ok\": true") != nullptr;
}

static bool jsonGetUint(const char* json, const char* key, uint32_t* out) {
  if (json == nullptr || key == nullptr || out == nullptr) {
    return false;
  }

  char needle[48];
  snprintf(needle, sizeof(needle), "\"%s\":", key);
  const char* p = strstr(json, needle);
  if (p == nullptr) {
    snprintf(needle, sizeof(needle), "\"%s\" :", key);
    p = strstr(json, needle);
    if (p == nullptr) {
      return false;
    }
  }

  p += strlen(needle);
  while (*p == ' ' || *p == '\t') {
    p++;
  }

  char* end = nullptr;
  unsigned long v = strtoul(p, &end, 10);
  if (end == p) {
    return false;
  }

  *out = (uint32_t)v;
  return true;
}

static bool jsonExtractStringError(const char* json, char* out, size_t out_len) {
  const char* p = strstr(json, "\"error\"");
  if (p == nullptr) {
    return false;
  }
  p = strchr(p, ':');
  if (p == nullptr) {
    return false;
  }
  p++;
  while (*p == ' ' || *p == '\t') {
    p++;
  }
  if (*p != '"') {
    return false;
  }
  p++;
  size_t i = 0;
  while (*p && *p != '"' && i + 1 < out_len) {
    if (*p == '\\' && *(p + 1)) {
      p++;
    }
    out[i++] = *p++;
  }
  out[i] = '\0';
  return i > 0;
}

/** Locate a JSON string value without allocating (points inside json buffer). */
static const char* jsonFindStringValue(const char* json, const char* key, size_t* out_len) {
  char patterns[2][64];
  snprintf(patterns[0], sizeof(patterns[0]), "\"%s\":\"", key);
  snprintf(patterns[1], sizeof(patterns[1]), "\"%s\": \"", key);

  const char* start = nullptr;
  for (int i = 0; i < 2; i++) {
    start = strstr(json, patterns[i]);
    if (start != nullptr) {
      start += strlen(patterns[i]);
      break;
    }
  }
  if (start == nullptr) {
    return nullptr;
  }

  const char* end = start;
  while (*end && *end != '"') {
    if (*end == '\\' && *(end + 1)) {
      end += 2;
      continue;
    }
    end++;
  }

  if (end == start) {
    return nullptr;
  }

  *out_len = (size_t)(end - start);
  return start;
}

static bool decodeBase64ToPcm(
    const char* b64,
    size_t b64_len,
    int16_t* pcm_out,
    size_t pcm_capacity,
    size_t* pcm_samples) {
  if (b64 == nullptr || b64_len == 0 || pcm_out == nullptr || pcm_samples == nullptr) {
    return false;
  }

  size_t olen = 0;
  int rc = mbedtls_base64_decode(nullptr, 0, &olen, (const unsigned char*)b64, b64_len);
  if (rc != MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL || olen < 2) {
    return false;
  }

  if (olen % sizeof(int16_t) != 0) {
    olen -= olen % sizeof(int16_t);
  }

  size_t samples = olen / sizeof(int16_t);
  if (samples == 0 || samples > pcm_capacity) {
    return false;
  }

  rc = mbedtls_base64_decode(
      (unsigned char*)pcm_out,
      olen,
      &olen,
      (const unsigned char*)b64,
      b64_len);
  if (rc != 0) {
    return false;
  }

  if (olen % sizeof(int16_t) != 0) {
    olen -= olen % sizeof(int16_t);
  }

  *pcm_samples = olen / sizeof(int16_t);
  return *pcm_samples > 0;
}

void voiceUploadResponseFree(VoiceUploadResponse* response) {
  if (response == nullptr) {
    return;
  }
  if (response->pcm != nullptr && response->pcm_heap_owned) {
    free(response->pcm);
  }
  response->pcm = nullptr;
  response->pcm_samples = 0;
  response->pcm_heap_owned = false;
}

VoiceUploadResult voiceUploadWav(
    const int16_t* pcm,
    size_t sample_count,
    const char* pos_id,
    VoiceUploadResponse* response,
    int16_t* pcm_reuse_buf,
    size_t pcm_reuse_capacity,
    char* error_out,
    size_t error_len) {
  if (response != nullptr) {
    memset(response, 0, sizeof(*response));
  }

  if (strlen(VOICE_QUERY_URL) == 0 || strlen(SUPABASE_ANON_KEY) == 0) {
    setError(error_out, error_len, "VOICE_QUERY_URL or anon key missing");
    return VOICE_UPLOAD_NOT_CONFIGURED;
  }
  if (pcm == nullptr || sample_count == 0) {
    setError(error_out, error_len, "no audio samples");
    return VOICE_UPLOAD_BUILD;
  }
  if (!wifiIsConnected()) {
    setError(error_out, error_len, "WiFi offline");
    return VOICE_UPLOAD_WIFI;
  }

  const char* pid = (pos_id != nullptr && pos_id[0] != '\0') ? pos_id : POS_ID;
  const uint32_t pcm_bytes = (uint32_t)(sample_count * sizeof(int16_t));
  const uint32_t wav_bytes = 44 + pcm_bytes;

  uint8_t* wav = (uint8_t*)allocPsram(wav_bytes);
  if (wav == nullptr) {
    setError(error_out, error_len, "WAV alloc failed");
    return VOICE_UPLOAD_BUILD;
  }

  voiceBuildWavHeader(wav, pcm_bytes);
  memcpy(wav + 44, pcm, pcm_bytes);

  char posField[128];
  snprintf(posField, sizeof(posField),
      "--%s\r\n"
      "Content-Disposition: form-data; name=\"pos_id\"\r\n\r\n"
      "%s\r\n",
      kMultipartBoundary,
      pid);

  char fileHeader[256];
  snprintf(fileHeader, sizeof(fileHeader),
      "--%s\r\n"
      "Content-Disposition: form-data; name=\"audio\"; filename=\"recording.wav\"\r\n"
      "Content-Type: audio/wav\r\n\r\n",
      kMultipartBoundary);

  char tail[64];
  snprintf(tail, sizeof(tail), "\r\n--%s--\r\n", kMultipartBoundary);

  const size_t body_len = strlen(posField) + strlen(fileHeader) + wav_bytes + strlen(tail);
  uint8_t* body = (uint8_t*)allocPsram(body_len);
  if (body == nullptr) {
    free(wav);
    setError(error_out, error_len, "body alloc failed");
    return VOICE_UPLOAD_BUILD;
  }

  size_t at = 0;
  memcpy(body + at, posField, strlen(posField));
  at += strlen(posField);
  memcpy(body + at, fileHeader, strlen(fileHeader));
  at += strlen(fileHeader);
  memcpy(body + at, wav, wav_bytes);
  at += wav_bytes;
  memcpy(body + at, tail, strlen(tail));
  at += strlen(tail);
  free(wav);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, VOICE_QUERY_URL)) {
    free(body);
    setError(error_out, error_len, "HTTP begin failed");
    return VOICE_UPLOAD_HTTP;
  }

  http.addHeader("Content-Type", String("multipart/form-data; boundary=") + kMultipartBoundary);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("ngrok-skip-browser-warning", "1");
  http.addHeader("Accept-Encoding", "identity");
  http.setTimeout(60000);
  http.setReuse(false);

  Serial.printf("[VOICE_UPLOAD] POST %u bytes (%u samples) pos=%s\n",
      (unsigned)body_len,
      (unsigned)sample_count,
      pid);

  int code = http.POST(body, body_len);
  free(body);

  size_t resp_len = 0;
  char* resp = readHttpBody(http, &resp_len, error_out, error_len);
  http.end();

  Serial.printf("[VOICE_UPLOAD] HTTP %d\n", code);
  if (resp != nullptr) {
    Serial.printf("[VOICE_UPLOAD] response %u bytes\n", (unsigned)resp_len);
  }

  if (code < 200 || code >= 300) {
    if (resp != nullptr) {
      if (!jsonExtractStringError(resp, error_out, error_len)) {
        snprintf(error_out, error_len, "HTTP %d", code);
      }
      free(resp);
    } else if (error_out != nullptr && error_len > 0 && error_out[0] == '\0') {
      snprintf(error_out, error_len, "HTTP %d", code);
    }
    return VOICE_UPLOAD_HTTP;
  }

  if (resp == nullptr) {
    return VOICE_UPLOAD_RESPONSE;
  }

  if (!jsonHasOk(resp)) {
    if (!jsonExtractStringError(resp, error_out, error_len)) {
      setError(error_out, error_len, "bad JSON");
    }
    Serial.printf("[VOICE_UPLOAD] parse fail: %s\n", error_out);
    if (resp_len > 0 && resp_len < 256) {
      Serial.println(resp);
    }
    free(resp);
    return VOICE_UPLOAD_RESPONSE;
  }

  uint32_t meta_samples = 0;
  uint32_t meta_duration_ms = 0;
  jsonGetUint(resp, "samples", &meta_samples);
  jsonGetUint(resp, "durationMs", &meta_duration_ms);

  char reply_buf[128] = {};
  size_t reply_len = 0;
  const char* reply = jsonFindStringValue(resp, "replyText", &reply_len);
  if (reply != nullptr && reply_len > 0) {
    size_t copy_len = reply_len;
    if (copy_len >= sizeof(reply_buf)) {
      copy_len = sizeof(reply_buf) - 1;
    }
    memcpy(reply_buf, reply, copy_len);
    reply_buf[copy_len] = '\0';
  }

  size_t b64_len = 0;
  const char* b64 = jsonFindStringValue(resp, "pcmBase64", &b64_len);
  if (b64 == nullptr || b64_len == 0) {
    free(resp);
    if (reply_buf[0] != '\0') {
      if (response != nullptr) {
        response->samples = 0;
        response->duration_ms = meta_duration_ms;
        response->pcm = nullptr;
        response->pcm_samples = 0;
        response->pcm_heap_owned = false;
        strncpy(response->reply_text, reply_buf, sizeof(response->reply_text) - 1);
        response->reply_text[sizeof(response->reply_text) - 1] = '\0';
      }
      Serial.printf("[VOICE_UPLOAD] OK text-only reply: %s\n", reply_buf);
      return VOICE_UPLOAD_OK;
    }
    setError(error_out, error_len, "missing pcmBase64");
    return VOICE_UPLOAD_RESPONSE;
  }

  size_t olen = 0;
  int rc = mbedtls_base64_decode(
      nullptr,
      0,
      &olen,
      (const unsigned char*)b64,
      b64_len);
  if (rc != MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL || olen < 2) {
    free(resp);
    setError(error_out, error_len, "invalid pcmBase64");
    return VOICE_UPLOAD_DECODE;
  }

  if (olen % sizeof(int16_t) != 0) {
    olen -= olen % sizeof(int16_t);
  }

  size_t needed_samples = olen / sizeof(int16_t);
  if (needed_samples == 0) {
    free(resp);
    setError(error_out, error_len, "empty pcm audio");
    return VOICE_UPLOAD_DECODE;
  }

  Serial.printf("[VOICE_UPLOAD] pcmBase64 %u chars, need %u samples\n",
      (unsigned)b64_len,
      (unsigned)needed_samples);

  int16_t* pcm_out = (int16_t*)allocPsram(needed_samples * sizeof(int16_t));
  bool pcm_owned = true;
  if (pcm_out == nullptr) {
    free(resp);
    setError(error_out, error_len, "PCM alloc failed");
    return VOICE_UPLOAD_DECODE;
  }

  size_t echo_samples = 0;
  if (!decodeBase64ToPcm(b64, b64_len, pcm_out, needed_samples, &echo_samples)) {
    if (pcm_owned) {
      free(pcm_out);
    }
    free(resp);
    Serial.printf(
        "[VOICE_UPLOAD] base64 decode failed b64_len=%u need_samples=%u resp_len=%u rc_hint\n",
        (unsigned)b64_len,
        (unsigned)needed_samples,
        (unsigned)resp_len);
    if (b64_len > 0) {
      size_t tail_len = b64_len > 32 ? 32 : b64_len;
      Serial.printf(
          "[VOICE_UPLOAD] b64 tail: ...%.*s\n",
          (int)tail_len,
          b64 + b64_len - tail_len);
    }
    setError(error_out, error_len, "base64 decode failed");
    return VOICE_UPLOAD_DECODE;
  }

  free(resp);

  if (response != nullptr) {
    response->samples = meta_samples > 0 ? meta_samples : (uint32_t)echo_samples;
    response->duration_ms = meta_duration_ms;
    response->pcm = pcm_out;
    response->pcm_samples = echo_samples;
    response->pcm_heap_owned = pcm_owned;
    strncpy(response->reply_text, reply_buf, sizeof(response->reply_text) - 1);
    response->reply_text[sizeof(response->reply_text) - 1] = '\0';
  } else if (pcm_owned) {
    free(pcm_out);
  }

  Serial.printf("[VOICE_UPLOAD] OK reply %u samples (%u ms)\n",
      (unsigned)echo_samples,
      (unsigned)meta_duration_ms);
  if (reply_buf[0] != '\0') {
    Serial.printf("[VOICE_UPLOAD] replyText: %s\n", reply_buf);
  }

  return VOICE_UPLOAD_OK;
}

#else

const char* voiceUploadResultText(VoiceUploadResult result) {
  (void)result;
  return "audio disabled";
}

void voiceBuildWavHeader(uint8_t* header44, uint32_t pcm_bytes) {
  (void)header44;
  (void)pcm_bytes;
}

void voiceUploadResponseFree(VoiceUploadResponse* response) {
  (void)response;
}

VoiceUploadResult voiceUploadWav(
    const int16_t* pcm,
    size_t sample_count,
    const char* pos_id,
    VoiceUploadResponse* response,
    int16_t* pcm_reuse_buf,
    size_t pcm_reuse_capacity,
    char* error_out,
    size_t error_len) {
  (void)pcm;
  (void)sample_count;
  (void)pos_id;
  (void)response;
  (void)pcm_reuse_buf;
  (void)pcm_reuse_capacity;
  if (error_out && error_len > 0) {
    strncpy(error_out, "AUDIO_ENABLE off", error_len - 1);
  }
  return VOICE_UPLOAD_NOT_CONFIGURED;
}

#endif
