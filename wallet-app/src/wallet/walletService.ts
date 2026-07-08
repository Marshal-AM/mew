import { HDNodeWallet, Mnemonic, TypedDataDomain, Wallet, verifyMessage } from "ethers";
import { TRANSFER_TYPES } from "./eip712";
import type { TransferMessage } from "./eip712";

export const SIGN_TEST_MESSAGE = "Moo Wallet Amoy test";

export type WalletCreation = {
  mnemonic: string;
  address: string;
};

export function createWallet(): WalletCreation {
  const wallet = Wallet.createRandom();
  const mnemonic = wallet.mnemonic?.phrase;
  if (!mnemonic) {
    throw new Error("Failed to generate mnemonic");
  }
  return { mnemonic, address: wallet.address };
}

export function normalizeMnemonic(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateMnemonic(mnemonic: string): boolean {
  return Mnemonic.isValidMnemonic(normalizeMnemonic(mnemonic));
}

export function importWallet(mnemonic: string): WalletCreation {
  const normalized = normalizeMnemonic(mnemonic);
  if (!Mnemonic.isValidMnemonic(normalized)) {
    throw new Error("Invalid recovery phrase. Check the words and try again.");
  }
  const wallet = Wallet.fromPhrase(normalized);
  return { mnemonic: normalized, address: wallet.address };
}

export function getWalletFromMnemonic(mnemonic: string): HDNodeWallet {
  return Wallet.fromPhrase(normalizeMnemonic(mnemonic));
}

export async function signMessage(
  wallet: HDNodeWallet,
  message: string
): Promise<string> {
  return wallet.signMessage(message);
}

export function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recovered = verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

export async function signTransferWithAuthorization(
  wallet: HDNodeWallet,
  domain: TypedDataDomain,
  message: TransferMessage
): Promise<string> {
  return wallet.signTypedData(domain, TRANSFER_TYPES, message);
}
