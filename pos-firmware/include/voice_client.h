#pragma once

#include <stddef.h>
#include <stdint.h>

typedef enum {
  VOICE_UPLOAD_OK = 0,
  VOICE_UPLOAD_NOT_CONFIGURED,
  VOICE_UPLOAD_WIFI,
  VOICE_UPLOAD_BUILD,
  VOICE_UPLOAD_HTTP,
  VOICE_UPLOAD_RESPONSE,
  VOICE_UPLOAD_DECODE,
} VoiceUploadResult;

struct VoiceUploadResponse {
  uint32_t samples;
  uint32_t duration_ms;
  int16_t* pcm;
  size_t pcm_samples;
  bool pcm_heap_owned;
  char reply_text[128];
};

/** Build 44-byte WAV header for PCM mono 16-bit at AUDIO_SAMPLE_RATE_HZ. */
void voiceBuildWavHeader(uint8_t* header44, uint32_t pcm_bytes);

/**
 * Upload PCM as WAV via multipart POST. On OK, response.pcm points to decoded
 * echo PCM (16 kHz mono int16). Pass pcm_reuse_buf to decode into caller memory
 * instead of a separate heap allocation (recommended — saves ~128 KB).
 */
VoiceUploadResult voiceUploadWav(
    const int16_t* pcm,
    size_t sample_count,
    const char* pos_id,
    VoiceUploadResponse* response,
    int16_t* pcm_reuse_buf,
    size_t pcm_reuse_capacity,
    char* error_out,
    size_t error_len);

void voiceUploadResponseFree(VoiceUploadResponse* response);

const char* voiceUploadResultText(VoiceUploadResult result);
