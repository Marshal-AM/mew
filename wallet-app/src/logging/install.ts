import { addLog } from "./appLogs";

declare global {
  var __MOO_LOGGER_INSTALLED__: boolean | undefined;
}

if (!global.__MOO_LOGGER_INSTALLED__) {
  global.__MOO_LOGGER_INSTALLED__ = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    addLog("log", ...args);
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    addLog("warn", ...args);
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    addLog("error", ...args);
    originalError(...args);
  };
}
