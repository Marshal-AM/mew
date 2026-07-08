import assert from "node:assert/strict";

const SIGNING_SESSION_TTL_MS = 60_000;

function createSessionRecord(sessions, sessionId, now) {
  sessions.set(sessionId, { id: sessionId, createdAt: now, consumed: false });
}

function isSessionValid(sessions, sessionId, now, ttlMs = SIGNING_SESSION_TTL_MS) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.consumed) return false;
  if (now - session.createdAt > ttlMs) return false;
  return true;
}

function consumeSessionRecord(sessions, sessionId) {
  const session = sessions.get(sessionId);
  if (session) session.consumed = true;
}

function assertSessionForSigning(sessions, sessionId, now, ttlMs = SIGNING_SESSION_TTL_MS) {
  if (!isSessionValid(sessions, sessionId, now, ttlMs)) {
    throw new Error("Signing session invalid or expired. Authenticate again.");
  }
}

function attemptSign(sessions, sessionId, now) {
  assertSessionForSigning(sessions, sessionId, now);
  consumeSessionRecord(sessions, sessionId);
  return "signed";
}

const sessions = new Map();
const now = 1_000_000;
createSessionRecord(sessions, "fresh", now);
assert.equal(attemptSign(sessions, "fresh", now + 1000), "signed");

let signCalled = false;
try {
  attemptSign(sessions, "fresh", now + 2000);
} catch (err) {
  signCalled = true;
  assert.match(err.message, /invalid or expired/);
}
assert.equal(signCalled, true, "consumed session blocks second sign");

sessions.clear();
createSessionRecord(sessions, "stale", now);
let staleBlocked = false;
try {
  attemptSign(sessions, "stale", now + SIGNING_SESSION_TTL_MS + 1);
} catch {
  staleBlocked = true;
}
assert.equal(staleBlocked, true, "expired session blocks sign");

let missingBlocked = false;
try {
  attemptSign(sessions, "missing", now);
} catch {
  missingBlocked = true;
}
assert.equal(missingBlocked, true, "missing session blocks sign");

console.log("test-auth-gate: PASS");
