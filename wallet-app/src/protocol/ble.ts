export const MOO_BLE_SERVICE_UUID = "6d6f6f01-0000-4000-8000-000000000001";
export const MOO_BLE_WRITE_CHAR_UUID = "6d6f6f02-0000-4000-8000-000000000002";
export const MOO_BLE_NOTIFY_CHAR_UUID = "6d6f6f03-0000-4000-8000-000000000003";

export const BLE_DEV_PASSKEY = 123456;
export const BLE_TARGET_MTU = 247;
export const BLE_DEFAULT_MTU = 23;
export const BLE_MAX_MESSAGE_BYTES = 4096;
export const BLE_CHUNK_ACK_TIMEOUT_MS = 10000;
export const BLE_TRANSFER_TIMEOUT_MS = 120000;

export function bleDeviceNameForPosId(posId: string): string {
  return `Moo-${posId}`;
}

export type NotifyMessage =
  | { t: "ca"; s: number }
  | { t: "ok"; len: number }
  | { t: "err"; m: string };

export function parseNotifyMessage(raw: string): NotifyMessage | null {
  try {
    const parsed = JSON.parse(raw) as NotifyMessage;
    if (!parsed || typeof parsed !== "object" || !("t" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
