type PayFlowLevel = "log" | "warn" | "error";

export type PayFlowCategory = "Pay" | "BLE" | "Allowance" | "Sign" | "Registry" | "Transfer";

function formatDetail(detail: unknown): string {
  if (detail === undefined) return "";
  if (detail instanceof Error) {
    return ` | ${detail.name}: ${detail.message}`;
  }
  if (typeof detail === "string") {
    return ` | ${detail}`;
  }
  try {
    return ` | ${JSON.stringify(detail)}`;
  } catch {
    return ` | ${String(detail)}`;
  }
}

function emit(level: PayFlowLevel, category: PayFlowCategory, event: string, detail?: unknown): void {
  const message = `[${category}] ${event}${formatDetail(detail)}`;
  if (level === "log") {
    console.log(message);
    return;
  }
  if (level === "warn") {
    console.warn(message);
    return;
  }
  console.error(message);
}

export const payFlowLog = {
  info: (category: PayFlowCategory, event: string, detail?: unknown) => emit("log", category, event, detail),
  warn: (category: PayFlowCategory, event: string, detail?: unknown) => emit("warn", category, event, detail),
  error: (category: PayFlowCategory, event: string, detail?: unknown) => emit("error", category, event, detail),
};
