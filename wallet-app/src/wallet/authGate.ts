import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import {
  assertSessionForSigning,
  consumeSessionRecord,
  createSessionRecord,
  type SigningSession,
} from "./authGateCore";

const sessions = new Map<string, SigningSession>();

export function resetSigningSessions(): void {
  sessions.clear();
}

export async function createSigningSession(): Promise<string> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware) {
    throw new Error("This device does not support biometric or PIN authentication.");
  }

  if (!enrolled) {
    throw new Error("Set up a device PIN or biometric lock before authorizing payments.");
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Authorize payment",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });

  if (!result.success) {
    throw new Error("Authentication failed or was cancelled.");
  }

  const bytes = await Crypto.getRandomBytesAsync(16);
  const sessionId = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  createSessionRecord(sessions, sessionId, Date.now());
  return sessionId;
}

export function assertSigningSession(sessionId: string): void {
  assertSessionForSigning(sessions, sessionId, Date.now());
}

export function consumeSigningSession(sessionId: string): void {
  assertSigningSession(sessionId);
  consumeSessionRecord(sessions, sessionId);
}
