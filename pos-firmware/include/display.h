#pragma once

#include <stdint.h>

bool displayInit();
bool displayIsReady();
void showProductSelectScreen();
void showEntryScreen(uint32_t cents, const char* productName);
void showQrScreen(const char* json, uint32_t cents);
void showError(const char* msg);
void showPendingScreen(uint32_t cents);
void showApprovedScreen(uint32_t cents);
void showDeclinedScreen(const char* reason);
void showHeldScreen(const char* reason);
void showBootStatusScreen(const char* status);
void showVoiceStatusScreen(const char* title, const char* subtitle);
