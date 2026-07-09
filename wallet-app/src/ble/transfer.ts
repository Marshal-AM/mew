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
import { payFlowLog } from "../logging/payFlow";

export type TransferProgress = {
  phase: "sending" | "waiting_echo" | "done" | "error";
  sentChunks: number;
  totalChunks: number;
  message?: string;
};

type EchoPart = { index: number; total: number; hex: string };
type PosInfo = { posId: string; payoutAddress: string };

export async function sendJsonPayload(
  device: Device,
  json: string,
  onProgress?: (progress: TransferProgress) => void
): Promise<{ ok: true; echo: string } | { ok: false; error: string }> {
  payFlowLog.info("Transfer", "sendJsonPayload start", {
    deviceId: device.id,
    jsonLen: json.length,
    preview: json.length > 120 ? `${json.slice(0, 120)}...` : json,
  });
  const connected = await connectToPos(device);
  const mtu = connected.mtu ?? 23;

  const messageBytes = appendCrc16(utf8Encode(json));
  const frames = splitIntoFrames(messageBytes, mtu);
  payFlowLog.info("Transfer", "frames prepared", { mtu, frameCount: frames.length, messageBytes: messageBytes.length });

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
          payFlowLog.info("Transfer", "echo part", { index: parsed.i, total: parsed.n, hexLen: parsed.h.length });
        }
      } catch {
        transferError = "Invalid echo part";
        payFlowLog.error("Transfer", "invalid echo part", raw);
      }
      return;
    }

    if (raw.includes("\"t\":\"echo_done\"")) {
      echoDone = true;
      payFlowLog.info("Transfer", "echo done");
      return;
    }

    const msg = parseNotifyMessage(raw);
    if (!msg) {
      payFlowLog.info("Transfer", "unparsed notify", raw);
      return;
    }

    if (msg.t === "ca" && ackResolver) {
      payFlowLog.info("Transfer", "chunk ack", { seq: msg.s });
      ackResolver(msg.s);
      return;
    }

    if (msg.t === "err") {
      transferError = msg.m;
      payFlowLog.error("Transfer", "device error", msg.m);
    } else if (msg.t === "ok") {
      payFlowLog.info("Transfer", "device ok", { len: msg.len });
    }
  });

  try {
    onProgress?.({ phase: "sending", sentChunks: 0, totalChunks: frames.length });
    payFlowLog.info("Transfer", "waiting before first write", { delayMs: 500 });
    await sleep(500);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const encoded = encodeFrame(frame);
      payFlowLog.info("Transfer", "sending frame", { seq: frame.seq, total: frame.total, bytes: encoded.length });

      const ackPromise = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          ackResolver = null;
          payFlowLog.error("Transfer", "chunk ack timeout", { seq: frame.seq, timeoutMs: BLE_CHUNK_ACK_TIMEOUT_MS });
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
        payFlowLog.error("Transfer", "sendJsonPayload failed", { seq: frame.seq });
        return { ok: false, error: `Chunk ack timeout at seq ${frame.seq}` };
      }

      onProgress?.({ phase: "sending", sentChunks: i + 1, totalChunks: frames.length });
    }

    onProgress?.({ phase: "waiting_echo", sentChunks: frames.length, totalChunks: frames.length });
    payFlowLog.info("Transfer", "waiting for echo");

    const echoed = await waitForEcho(() => echoDone, echoParts, BLE_TRANSFER_TIMEOUT_MS);
    if (transferError) {
      payFlowLog.error("Transfer", "echo failed with device error", transferError);
      return { ok: false, error: transferError };
    }
    if (!echoed) {
      payFlowLog.error("Transfer", "echo timeout");
      return { ok: false, error: "Echo timeout" };
    }

    const matches = echoed === json;
    payFlowLog.info("Transfer", "echo received", { matches, echoedLen: echoed.length });
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
      payFlowLog.info("Transfer", "disconnecting", { deviceId: connected.id });
      await connected.cancelConnection();
    } catch (err) {
      payFlowLog.warn("Transfer", "disconnect error", err);
    }
  }
}

export async function requestPosInfo(device: Device): Promise<PosInfo> {
  payFlowLog.info("Transfer", "requestPosInfo start", { deviceId: device.id });
  const connected = await connectToPos(device);
  const mtu = connected.mtu ?? 23;
  const requestJson = JSON.stringify({ t: "pi" });
  const messageBytes = appendCrc16(utf8Encode(requestJson));
  const frames = splitIntoFrames(messageBytes, mtu);
  payFlowLog.info("Transfer", "pos info request prepared", { requestJson, mtu, frameCount: frames.length });

  let transferError: string | null = null;
  let posInfo: PosInfo | null = null;
  let posInfoResolver: ((value: PosInfo) => void) | null = null;

  const posInfoPromise = new Promise<PosInfo>((resolve, reject) => {
    posInfoResolver = resolve;
    setTimeout(() => {
      payFlowLog.error("Transfer", "pos info timeout", { timeoutMs: BLE_TRANSFER_TIMEOUT_MS });
      reject(new Error("POS info timeout"));
    }, BLE_TRANSFER_TIMEOUT_MS);
  });

  const notify = monitorNotifications(connected, (raw) => {
    const msg = parseNotifyMessage(raw);
    if (!msg) {
      payFlowLog.info("Transfer", "pos info unparsed notify", raw);
      return;
    }

    if (msg.t === "err") {
      transferError = msg.m;
      payFlowLog.error("Transfer", "pos info device error", msg.m);
      return;
    }
    if (msg.t === "pi") {
      posInfo = { posId: msg.posId, payoutAddress: msg.payoutAddress };
      payFlowLog.info("Transfer", "pos info received", posInfo);
      posInfoResolver?.(posInfo);
    } else if (msg.t === "ok") {
      payFlowLog.info("Transfer", "pos info device ok", { len: msg.len });
    }
  });

  try {
    payFlowLog.info("Transfer", "waiting before pos info write", { delayMs: 500 });
    await sleep(500);

    for (const frame of frames) {
      const encoded = encodeFrame(frame);
      payFlowLog.info("Transfer", "pos info sending frame", { seq: frame.seq, total: frame.total });
      await writeChunk(connected, encoded);
    }

    const resolved = await posInfoPromise;
    if (transferError) {
      throw new Error(transferError);
    }
    if (!resolved.payoutAddress) {
      throw new Error("POS payout address missing");
    }
    payFlowLog.info("Transfer", "requestPosInfo success", resolved);
    return resolved;
  } catch (err) {
    payFlowLog.error("Transfer", "requestPosInfo failed", err);
    throw err;
  } finally {
    notify.remove();
    try {
      payFlowLog.info("Transfer", "pos info disconnecting", { deviceId: connected.id });
      await connected.cancelConnection();
    } catch (err) {
      payFlowLog.warn("Transfer", "pos info disconnect error", err);
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
