export const FORWARDER_NAME = "Moo Payment Forwarder";
export const FORWARDER_VERSION = "1";
export const DEFAULT_CHAIN_ID = 80002;
export const DEFAULT_FORWARDER_ADDRESS = "0x9F0BF4aE6BBfD51eDbff77eA0D17A7bec484bb97";

export const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "token", type: "address" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function buildDomain(chainId: number, verifyingContract: string) {
  return {
    name: FORWARDER_NAME,
    version: FORWARDER_VERSION,
    chainId,
    verifyingContract,
  };
}
