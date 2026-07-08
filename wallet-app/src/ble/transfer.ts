import { Device } from "react-native-ble-plx";
import {
  BLE_CHUNK_ACK_TIMEOUT_MS,
  BLE_TRANSFER_TIMEOUT_MS,
  parseNotifyMessage,
} from "../protocol/ble";
import {
  appendCrc16,
  encodeFrame,
  splitIntoFrames,
  utf8Decode,
  utf8Encode,
} from "../protocol/chunk";
import { connectToPos, monitorNotifications, writeChunk } from "./BleManager";

export type TransferProgress = {
  phase: "sending" | "waiting_echo" | "done" | "error";
  sentChunks: number;
  totalChunks: number;
  message?: string;
};

type EchoPart = { index: number; total: number; hex: string };

export async function sendJsonPayload(
  device: Device,
  json: string,
  onProgress?: (progress: TransferProgress) => void
): Promise<{ ok: true; echo: string } | { ok: false; error: string }> {
  const connected = await connectToPos(device);
  const mtu = connected.mtu ?? 23;

  const messageBytes = appendCrc16(utf8Encode(json));
  const frames = splitIntoFrames(messageBytes, mtu);

  const echoParts: EchoPart[] = [];
  let echoDone = false;
  let transferError: string | null = null;
  let ackResolver: ((seq: number) => void) | null = null;

  const notify = monitorNotifications(connected, (raw) => {
    if (raw.includes("\"t\":\"ep\"")) {
      try {
        const parsed = JSON.parse(raw) as { t: string; i: number; n: number; h: string };
        if (parsed.t === "ep") {
          echoParts.push({ index: parsed.i, total: parsed.n, hex: parsed.h });
        }
      } catch {
        transferError = "Invalid echo part";
      }
      return;
    }

    if (raw.includes("\"t\":\"echo_done\"")) {
      echoDone = true;
      return;
    }

    const msg = parseNotifyMessage(raw);
    if (!msg) {
      return;
    }

    if (msg.t === "ca" && ackResolver) {
      ackResolver(msg.s);
      return;
    }

    if (msg.t === "err") {
      transferError = msg.m;
    }
  });

  try {
    onProgress?.({ phase: "sending", sentChunks: 0, totalChunks: frames.length });

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const encoded = encodeFrame(frame);

      const ackPromise = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          ackResolver = null;
          resolve(false);
        }, BLE_CHUNK_ACK_TIMEOUT_MS);
        ackResolver = (ackedSeq) => {
          if (ackedSeq === frame.seq) {
            clearTimeout(timer);
            ackResolver = null;
            resolve(true);
          }
        };
      });

      await writeChunk(connected, encoded);
      const acked = await ackPromise;
      if (!acked) {
        return { ok: false, error: `Chunk ack timeout at seq ${frame.seq}` };
      }

      onProgress?.({ phase: "sending", sentChunks: i + 1, totalChunks: frames.length });
    }

    onProgress?.({ phase: "waiting_echo", sentChunks: frames.length, totalChunks: frames.length });

    const echoed = await waitForEcho(() => echoDone, echoParts, BLE_TRANSFER_TIMEOUT_MS);
    if (transferError) {
      return { ok: false, error: transferError };
    }
    if (!echoed) {
      return { ok: false, error: "Echo timeout" };
    }

    const matches = echoed === json;
    onProgress?.({
      phase: matches ? "done" : "error",
      sentChunks: frames.length,
      totalChunks: frames.length,
      message: matches ? "Echo matches sent payload" : "Echo mismatch",
    });

    return matches ? { ok: true, echo: echoed } : { ok: false, error: "Echo mismatch" };
  } finally {
    notify.remove();
    try {
      await connected.cancelConnection();
    } catch {
      // ignore disconnect errors
    }
  }
}

async function waitForEcho(
  isDone: () => boolean,
  parts: EchoPart[],
  timeoutMs: number
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isDone() && parts.length > 0) {
      const total = parts[0].total;
      if (parts.length >= total) {
        const sorted = [...parts].sort((a, b) => a.index - b.index);
        const hex = sorted.map((p) => p.hex).join("");
        const bytes = hexToBytes(hex);
        return utf8Decode(bytes);
      }
    }
    await sleep(50);
  }
  return null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTestPayload(
  device: Device,
  json: string,
  onProgress?: (progress: TransferProgress) => void
): Promise<{ ok: true; echo: string } | { ok: false; error: string }> {
  return sendJsonPayload(device, json, onProgress);
}

export async function sendSignedPayment(
  device: Device,
  json: string,
  onProgress?: (progress: TransferProgress) => void
): Promise<{ ok: true; echo: string } | { ok: false; error: string }> {
  return sendJsonPayload(device, json, onProgress);
}
