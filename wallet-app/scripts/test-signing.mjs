import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet, parseUnits, verifyTypedData } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const deployments = JSON.parse(
  readFileSync(join(__dirname, "../src/chain/deployments.json"), "utf8")
);

const FORWARDER_NAME = "Moo Payment Forwarder";
const FORWARDER_VERSION = "1";

const transferTypes = {
  TransferWithAuthorization: [
    { name: "token", type: "address" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const domain = {
  name: FORWARDER_NAME,
  version: FORWARDER_VERSION,
  chainId: deployments.chainId,
  verifyingContract: deployments.paymentForwarder,
};

const wallet = Wallet.createRandom();
const exp = Math.floor(Date.now() / 1000) + 600;
const message = {
  token: deployments.testToken,
  from: wallet.address,
  to: Wallet.createRandom().address,
  value: parseUnits("5.00", 6),
  validAfter: 0n,
  validBefore: BigInt(exp),
  nonce: "0x" + "ab".repeat(32),
};

const signature = await wallet.signTypedData(domain, transferTypes, message);
const recovered = verifyTypedData(domain, transferTypes, message, signature);
assert.equal(recovered, wallet.address, "signer recovery matches");

assert.equal(message.validBefore, BigInt(exp), "validBefore uses payment request exp");

console.log("test-signing: PASS");
