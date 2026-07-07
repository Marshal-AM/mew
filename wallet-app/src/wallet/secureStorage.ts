import * as SecureStore from "expo-secure-store";

const MNEMONIC_KEY = "moo.wallet.mnemonic";

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function hasWallet(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(MNEMONIC_KEY, secureOptions);
  return value !== null && value.length > 0;
}

export async function saveMnemonic(mnemonic: string): Promise<void> {
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic.trim(), secureOptions);
}

export async function loadMnemonic(): Promise<string> {
  const value = await SecureStore.getItemAsync(MNEMONIC_KEY, secureOptions);
  if (!value) {
    throw new Error("No wallet found in secure storage");
  }
  return value;
}

export async function deleteMnemonic(): Promise<void> {
  await SecureStore.deleteItemAsync(MNEMONIC_KEY, secureOptions);
}
