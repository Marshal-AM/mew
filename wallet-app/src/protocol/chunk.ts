const CRC16_POLY = 0x1021;
const CRC16_INIT = 0xffff;

export function crc16CcittFalse(data: Uint8Array): number {
  let crc = CRC16_INIT;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ CRC16_POLY) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
}

export function appendCrc16(message: Uint8Array): Uint8Array {
  const crc = crc16CcittFalse(message);
  const out = new Uint8Array(message.length + 2);
  out.set(message, 0);
  out[message.length] = (crc >> 8) & 0xff;
  out[message.length + 1] = crc & 0xff;
  return out;
}

export function verifyAndStripCrc16(buffer: Uint8Array): { ok: true; message: Uint8Array } | { ok: false } {
  if (buffer.length < 2) {
    return { ok: false };
  }
  const payload = buffer.subarray(0, buffer.length - 2);
  const expected = crc16CcittFalse(payload);
  const received = (buffer[buffer.length - 2] << 8) | buffer[buffer.length - 1];
  if (expected !== received) {
    return { ok: false };
  }
  return { ok: true, message: payload };
}

export const BLE_DEFAULT_MTU = 23;

export function chunkPayloadSize(mtu: number): number {
  const effective = Math.min(Math.max(mtu, BLE_DEFAULT_MTU) - 3, 244);
  return Math.max(1, effective - 2);
}

export type ChunkFrame = {
  seq: number;
  total: number;
  payload: Uint8Array;
};

export function splitIntoFrames(buffer: Uint8Array, mtu: number): ChunkFrame[] {
  const payloadSize = chunkPayloadSize(mtu);
  const total = Math.max(1, Math.ceil(buffer.length / payloadSize));
  if (total > 255) {
    throw new Error("Message too large for chunk protocol");
  }

  const frames: ChunkFrame[] = [];
  for (let seq = 0; seq < total; seq++) {
    const start = seq * payloadSize;
    const end = Math.min(start + payloadSize, buffer.length);
    frames.push({
      seq,
      total,
      payload: buffer.subarray(start, end),
    });
  }
  return frames;
}

export function encodeFrame(frame: ChunkFrame): Uint8Array {
  const out = new Uint8Array(2 + frame.payload.length);
  out[0] = frame.seq;
  out[1] = frame.total;
  out.set(frame.payload, 2);
  return out;
}

export class ChunkReassembler {
  private total = 0;
  private parts = new Map<number, Uint8Array>();
  private lastUpdate = 0;

  reset(): void {
    this.total = 0;
    this.parts.clear();
    this.lastUpdate = 0;
  }

  addFrame(seq: number, total: number, payload: Uint8Array): Uint8Array | null {
    if (total < 1 || total > 255 || seq < 0 || seq >= total) {
      this.reset();
      return null;
    }

    if (this.parts.size === 0) {
      this.total = total;
    } else if (this.total !== total) {
      this.reset();
      return null;
    }

    if (this.parts.has(seq)) {
      return null;
    }

    this.parts.set(seq, payload);
    this.lastUpdate = Date.now();

    if (this.parts.size !== this.total) {
      return null;
    }

    const length = Array.from(this.parts.values()).reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (let i = 0; i < this.total; i++) {
      const part = this.parts.get(i);
      if (!part) {
        this.reset();
        return null;
      }
      out.set(part, offset);
      offset += part.length;
    }

    this.reset();
    return out;
  }

  isStale(timeoutMs: number): boolean {
    if (this.parts.size === 0) {
      return false;
    }
    return Date.now() - this.lastUpdate > timeoutMs;
  }
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
