#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

bool audioInit();
/** Periodic mic level logging (like wifiLoop). Call every main loop iteration. */
void audioLoop();
bool audioIsReady();
bool audioRecordMono16k(int16_t* buf, size_t samples);
bool audioPlayMono16k(const int16_t* buf, size_t samples);
bool audioLoopbackTest(uint32_t seconds);
/** Sample mic for duration_ms and log peak/mean/signal status to Serial. */
bool audioProbeMic(uint32_t duration_ms);
/** Scan I2C bus, GPIO lines, and try I2S pin sets to detect a connected INMP441. */
void audioDetectHardware();
/** Deep I2S/format/pin sweep — send over serial when basic detect fails. */
void audioDeepDiag();
/** Speaker/amp diagnostic — GPIO check + test beeps on MAX98357A. */
void audioSpeakerDiag();
/** Keypad A: begin buffering mic audio into RAM. */
void audioVoiceStartRecord();
/** Keypad B: stop recording (if active) and play buffered audio on speaker. */
void audioVoicePlayRecorded();
bool audioVoiceIsRecording();
