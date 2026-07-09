import { BleManager, Device, State } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";
import { base64ToUtf8, bytesToBase64 } from "./base64";
import { payFlowLog } from "../logging/payFlow";
import {
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
    const granted =
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    payFlowLog.info("BLE", "permissions result", { apiLevel, granted, result });
    return granted;
  }

  const location = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  const granted = location === PermissionsAndroid.RESULTS.GRANTED;
  payFlowLog.info("BLE", "location permission result", { granted });
  return granted;
}

export async function waitForPoweredOn(timeoutMs = 10000): Promise<void> {
  const ble = getBleManager();
  const start = Date.now();

  payFlowLog.info("BLE", "waiting for powered on");
  while (Date.now() - start < timeoutMs) {
    const state = await ble.state();
    if (state === State.PoweredOn) {
      payFlowLog.info("BLE", "adapter powered on");
      return;
    }
    await sleep(300);
  }

  payFlowLog.error("BLE", "adapter not powered on", { timeoutMs });
  throw new Error("Bluetooth is not powered on");
}

export async function scanForPosDevice(posId: string, timeoutMs = 12000): Promise<Device> {
  const ble = getBleManager();
  const expectedName = bleDeviceNameForPosId(posId);
  const found = new Map<string, Device>();
  payFlowLog.info("BLE", "scan started", { posId, expectedName, timeoutMs, service: MOO_BLE_SERVICE_UUID });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ble.stopDeviceScan();
      payFlowLog.error("BLE", "scan timeout", { posId, expectedName, seen: found.size });
      reject(new Error(`POS device not found (${expectedName})`));
    }, timeoutMs);

    ble.startDeviceScan([MOO_BLE_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
      if (error) {
        clearTimeout(timer);
        ble.stopDeviceScan();
        payFlowLog.error("BLE", "scan error", error);
        reject(error);
        return;
      }
      if (!device) {
        return;
      }

      const name = device.localName ?? device.name ?? "";
      payFlowLog.info("BLE", "scan saw device", { id: device.id, name, rssi: device.rssi });
      if (name.includes(posId) || name === expectedName) {
        found.set(device.id, device);
        payFlowLog.info("BLE", "scan matched POS", { id: device.id, name });
      }
    });

    const pickTimer = setInterval(() => {
      const devices = [...found.values()];
      if (devices.length > 0) {
        clearTimeout(timer);
        clearInterval(pickTimer);
        ble.stopDeviceScan();
        const picked = devices[0];
        payFlowLog.info("BLE", "scan picked device", {
          id: picked.id,
          name: picked.localName ?? picked.name ?? "",
          rssi: picked.rssi,
        });
        resolve(picked);
      }
    }, 500);

    setTimeout(() => clearInterval(pickTimer), timeoutMs);
  });
}

export async function connectToPos(device: Device): Promise<Device> {
  payFlowLog.info("BLE", "connecting", {
    id: device.id,
    name: device.localName ?? device.name ?? "",
    targetMtu: BLE_TARGET_MTU,
  });
  const connected = await device.connect({ requestMTU: BLE_TARGET_MTU });
  await connected.discoverAllServicesAndCharacteristics();

  const mtu = connected.mtu ?? 23;
  payFlowLog.info("BLE", "connected", {
    id: connected.id,
    mtu,
    name: connected.localName ?? connected.name ?? "",
    isConnected: connected.isConnected,
  });
  return connected;
}

export function monitorNotifications(
  device: Device,
  onMessage: (raw: string) => void
): { remove: () => void } {
  payFlowLog.info("BLE", "notify subscribe", {
    deviceId: device.id,
    service: MOO_BLE_SERVICE_UUID,
    characteristic: MOO_BLE_NOTIFY_CHAR_UUID,
  });
  const subscription = device.monitorCharacteristicForService(
    MOO_BLE_SERVICE_UUID,
    MOO_BLE_NOTIFY_CHAR_UUID,
    (error, characteristic) => {
      if (error) {
        payFlowLog.warn("BLE", "notify error", error.message);
        return;
      }
      if (!characteristic?.value) {
        return;
      }
      const raw = base64ToUtf8(characteristic.value);
      payFlowLog.info("BLE", "notify rx", raw.length > 180 ? `${raw.slice(0, 180)}...` : raw);
      onMessage(raw);
    }
  );

  return {
    remove: () => {
      payFlowLog.info("BLE", "notify unsubscribe", { deviceId: device.id });
      subscription.remove();
    },
  };
}

export async function writeChunk(device: Device, frame: Uint8Array): Promise<void> {
  const seq = frame[0];
  const total = frame[1];
  const payloadLen = Math.max(0, frame.length - 2);
  payFlowLog.info("BLE", "write chunk", { deviceId: device.id, seq, total, payloadLen, frameBytes: frame.length });
  const base64 = bytesToBase64(frame);
  await device.writeCharacteristicWithResponseForService(
    MOO_BLE_SERVICE_UUID,
    MOO_BLE_WRITE_CHAR_UUID,
    base64
  );
  payFlowLog.info("BLE", "write chunk done", { deviceId: device.id, seq });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
