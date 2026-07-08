export const SIGNING_SESSION_TTL_MS = 60_000;

export type SigningSession = {
  id: string;
  createdAt: number;
  consumed: boolean;
};

export function createSessionRecord(
  sessions: Map<string, SigningSession>,
  sessionId: string,
  now: number
): void {
  sessions.set(sessionId, { id: sessionId, createdAt: now, consumed: false });
}

export function isSessionValid(
  sessions: Map<string, SigningSession>,
  sessionId: string,
  now: number,
  ttlMs = SIGNING_SESSION_TTL_MS
): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  if (session.consumed) {
    return false;
  }
  if (now - session.createdAt > ttlMs) {
    return false;
  }
  return true;
}

export function consumeSessionRecord(
  sessions: Map<string, SigningSession>,
  sessionId: string
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.consumed = true;
  }
}

export function assertSessionForSigning(
  sessions: Map<string, SigningSession>,
  sessionId: string,
  now: number,
  ttlMs = SIGNING_SESSION_TTL_MS
): void {
  if (!isSessionValid(sessions, sessionId, now, ttlMs)) {
    throw new Error("Signing session invalid or expired. Authenticate again.");
  }
}
