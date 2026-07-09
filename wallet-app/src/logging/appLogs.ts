type LogLevel = "log" | "warn" | "error";

export type LogEntry = {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
};

type Listener = () => void;

const entries: LogEntry[] = [];
const listeners = new Set<Listener>();
const MAX_ENTRIES = 500;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function stringifyPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (part instanceof Error) return `${part.name}: ${part.message}${part.stack ? `\n${part.stack}` : ""}`;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

export function addLog(level: LogLevel, ...parts: unknown[]): void {
  const message = parts.map(stringifyPart).join(" ");
  entries.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    message,
    timestamp: new Date().toISOString(),
  });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  notify();
}

export function getLogs(): LogEntry[] {
  return [...entries];
}

export function clearLogs(): void {
  entries.length = 0;
  notify();
}

export function subscribeLogs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
