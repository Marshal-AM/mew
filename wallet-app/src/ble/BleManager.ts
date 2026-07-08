import { BleManager, Device, State } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";
import { base64ToUtf8, bytesToBase64 } from "./base64";
import {
  BLE_DEV_PASSKEY,
  BLE_TARGET_MTU,
  MOO_BLE_NOTIFY_CHAR_UUID,
  MOO_BLE_SERVICE_UUID,
  MOO_BLE_WRITE_CHAR_UUID,
  bleDeviceNameForPosId,
} from "../protocol/ble";

let manager: BleManager | null = null;

export function getBleManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  const apiLevel = Platform.Version;
  if (typeof apiLevel === "number" && apiLevel >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const location = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return location === PermissionsAndroid.RESULTS.GRANTED;
}

export async function waitForPoweredOn(timeoutMs = 10000): Promise<void> {
  const ble = getBleManager();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = await ble.state();
    if (state === State.PoweredOn) {
      return;
    }
    await sleep(300);
  }

  throw new Error("Bluetooth is not powered on");
}

export async function scanForPosDevice(posId: string, timeoutMs = 12000): Promise<Device> {
  const ble = getBleManager();
  const expectedName = bleDeviceNameForPosId(posId);
  const found = new Map<string, Device>();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ble.stopDeviceScan();
      reject(new Error(`POS device not found (${expectedName})`));
    }, timeoutMs);

    ble.startDeviceScan([MOO_BLE_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
      if (error) {
        clearTimeout(timer);
        ble.stopDeviceScan();
        reject(error);
        return;
      }
      if (!device) {
        return;
      }

      const name = device.localName ?? device.name ?? "";
      if (name.includes(posId) || name === expectedName) {
        found.set(device.id, device);
      }
    });

    const pickTimer = setInterval(() => {
      const devices = [...found.values()];
      if (devices.length > 0) {
        clearTimeout(timer);
        clearInterval(pickTimer);
        ble.stopDeviceScan();
        resolve(devices[0]);
      }
    }, 500);

    setTimeout(() => clearInterval(pickTimer), timeoutMs);
  });
}

export async function connectToPos(device: Device): Promise<Device> {
  const connected = await device.connect({ requestMTU: BLE_TARGET_MTU });
  await connected.discoverAllServicesAndCharacteristics();

  const mtu = connected.mtu ?? 23;
  console.log(`[BLE] connected mtu=${mtu}, passkey=${BLE_DEV_PASSKEY}`);
  return connected;
}

export function monitorNotifications(
  device: Device,
  onMessage: (raw: string) => void
): { remove: () => void } {
  const subscription = device.monitorCharacteristicForService(
    MOO_BLE_SERVICE_UUID,
    MOO_BLE_NOTIFY_CHAR_UUID,
    (error, characteristic) => {
      if (error) {
        console.warn("[BLE] notify error", error.message);
        return;
      }
      if (!characteristic?.value) {
        return;
      }
      const raw = base64ToUtf8(characteristic.value);
      onMessage(raw);
    }
  );

  return {
    remove: () => subscription.remove(),
  };
}

export async function writeChunk(device: Device, frame: Uint8Array): Promise<void> {
  const base64 = bytesToBase64(frame);
  await device.writeCharacteristicWithResponseForService(
    MOO_BLE_SERVICE_UUID,
    MOO_BLE_WRITE_CHAR_UUID,
    base64
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
