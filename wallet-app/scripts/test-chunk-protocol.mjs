#!/usr/bin/env node

const CRC16_POLY = 0x1021;
const CRC16_INIT = 0xffff;

function crc16CcittFalse(data) {
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

function appendCrc16(message) {
  const crc = crc16CcittFalse(message);
  const out = new Uint8Array(message.length + 2);
  out.set(message, 0);
  out[message.length] = (crc >> 8) & 0xff;
  out[message.length + 1] = crc & 0xff;
  return out;
}

function verifyAndStripCrc16(buffer) {
  if (buffer.length < 2) return null;
  const payload = buffer.subarray(0, buffer.length - 2);
  const expected = crc16CcittFalse(payload);
  const received = (buffer[buffer.length - 2] << 8) | buffer[buffer.length - 1];
  if (expected !== received) return null;
  return payload;
}

function chunkPayloadSize(mtu) {
  const effective = Math.min(Math.max(mtu, 23) - 3, 244);
  return Math.max(1, effective - 2);
}

function splitIntoFrames(buffer, mtu) {
  const payloadSize = chunkPayloadSize(mtu);
  const total = Math.max(1, Math.ceil(buffer.length / payloadSize));
  const frames = [];
  for (let seq = 0; seq < total; seq++) {
    const start = seq * payloadSize;
    const end = Math.min(start + payloadSize, buffer.length);
    frames.push({ seq, total, payload: buffer.subarray(start, end) });
  }
  return frames;
}

function reassemble(frames) {
  const sorted = [...frames].sort((a, b) => a.seq - b.seq);
  const total = sorted[0]?.total ?? 0;
  if (sorted.length !== total) throw new Error("missing frames");
  const length = sorted.reduce((sum, f) => sum + f.payload.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const frame of sorted) {
    out.set(frame.payload, offset);
    offset += frame.payload.length;
  }
  return out;
}

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
}

const sample = new TextEncoder().encode('{"test":true,"posNonce":"abc123"}');
const withCrc = appendCrc16(sample);
const stripped = verifyAndStripCrc16(withCrc);
assert(stripped !== null, "crc round-trip");
assert(new TextDecoder().decode(stripped) === new TextDecoder().decode(sample), "payload match");

const known = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
assert(crc16CcittFalse(known) === 0x29b1, "known crc vector");

const big = new Uint8Array(2048);
for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
const framed = splitIntoFrames(appendCrc16(big), 23);
assert(framed.length > 50, "many frames at default mtu");
const rebuilt = verifyAndStripCrc16(reassemble(framed));
assert(rebuilt !== null && rebuilt.length === big.length, "2kb reassembly");

const payment = '{"posId":"POS-001","amt":"5.00","reqId":"a1b2c3","posNonce":"a3f9c1e2b4d5f6a7b8c9d0e1f2a3b4c5","exp":1700000300}';
JSON.parse(payment);
assert(true, "payment json parses");

console.log("PASS: chunk protocol tests");
