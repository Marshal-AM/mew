export function bytesToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += chars[(triple >> 18) & 0x3f];
    output += chars[(triple >> 12) & 0x3f];
    output += i + 1 < bytes.length ? chars[(triple >> 6) & 0x3f] : "=";
    output += i + 2 < bytes.length ? chars[triple & 0x3f] : "=";
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/=+$/, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = chars.indexOf(clean[i + 2]);
    const d = chars.indexOf(clean[i + 3]);
    const triple = (a << 18) | (b << 12) | ((c >= 0 ? c : 0) << 6) | (d >= 0 ? d : 0);
    out.push((triple >> 16) & 0xff);
    if (i + 2 < clean.length && clean[i + 2] !== "=") out.push((triple >> 8) & 0xff);
    if (i + 3 < clean.length && clean[i + 3] !== "=") out.push(triple & 0xff);
  }
  return new Uint8Array(out);
}

export function base64ToUtf8(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64));
}
