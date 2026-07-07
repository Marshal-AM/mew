import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { IERC20, PaymentForwarder } from "../typechain-types";

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
} as const;

function parseArgs() {
  const args = process.argv.slice(2);
  let to: string | undefined;
  let token: string | undefined;
  let amount = "5";
  let decimals = 6;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
    else if (args[i] === "--token" && args[i + 1]) token = args[++i];
    else if (args[i] === "--amount" && args[i + 1]) amount = args[++i];
    else if (args[i] === "--decimals" && args[i + 1]) decimals = parseInt(args[++i], 10);
  }

  return { to, token, amount, decimals };
}

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}. Run deploy:amoy first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as {
    paymentForwarder: string;
    testToken?: string;
  };

  const { to: toArg, token: tokenArg, amount: amountArg, decimals } = parseArgs();
  const tokenAddress = tokenArg ?? deployment.testToken;
  if (!tokenAddress) {
    throw new Error("No --token provided and deployments file has no testToken. Pass --token 0x...");
  }

  const [relayer] = await ethers.getSigners();

  const offlineSignerKey = process.env.OFFLINE_SIGNER_KEY;
  const signerWallet = offlineSignerKey
    ? new ethers.Wallet(offlineSignerKey, ethers.provider)
    : ethers.Wallet.createRandom().connect(ethers.provider);

  const recipient = toArg ?? relayer.address;
  const value = ethers.parseUnits(amountArg, decimals);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const forwarder = (await ethers.getContractAt(
    "PaymentForwarder",
    deployment.paymentForwarder
  )) as PaymentForwarder;

  const token = (await ethers.getContractAt("IERC20", tokenAddress)) as IERC20;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const signerBalance = await token.balanceOf(signerWallet.address);
  if (signerBalance < value) {
    if (deployment.testToken && tokenAddress.toLowerCase() === deployment.testToken.toLowerCase()) {
      console.log("Minting test tokens to offline signer:", signerWallet.address);
      const payToken = await ethers.getContractAt("PayToken", tokenAddress);
      await (await payToken.mint(signerWallet.address, ethers.parseUnits("1000", decimals))).wait();
    } else {
      throw new Error(
        `Signer ${signerWallet.address} has insufficient balance of token ${tokenAddress}. Fund the wallet first.`
      );
    }
  }

  const allowance = await token.allowance(signerWallet.address, deployment.paymentForwarder);
  if (allowance < value) {
    console.log("Approving forwarder for token:", tokenAddress);
    await (await token.connect(signerWallet).approve(deployment.paymentForwarder, ethers.MaxUint256)).wait();
  }

  const domain = {
    name: FORWARDER_NAME,
    version: FORWARDER_VERSION,
    chainId,
    verifyingContract: deployment.paymentForwarder,
  };

  const message = {
    token: tokenAddress,
    from: signerWallet.address,
    to: recipient,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  console.log("Token:", tokenAddress);
  console.log("Forwarder:", deployment.paymentForwarder);
  console.log("Offline signer:", signerWallet.address);
  console.log("Relayer:", relayer.address);
  console.log("Recipient:", recipient);
  console.log("Amount:", amountArg);
  console.log("Nonce:", nonce);

  const signature = await signerWallet.signTypedData(domain, transferTypes, message);
  const sig = ethers.Signature.from(signature);

  const beforeFrom = await token.balanceOf(signerWallet.address);
  const beforeTo = await token.balanceOf(recipient);
  console.log("Balances before — from:", ethers.formatUnits(beforeFrom, decimals), "to:", ethers.formatUnits(beforeTo, decimals));

  const tx = await forwarder.transferWithAuthorization(
    tokenAddress,
    signerWallet.address,
    recipient,
    value,
    validAfter,
    validBefore,
    nonce,
    sig.v,
    sig.r,
    sig.s
  );

  console.log("Relay tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt?.blockNumber);

  const afterFrom = await token.balanceOf(signerWallet.address);
  const afterTo = await token.balanceOf(recipient);
  console.log("Balances after — from:", ethers.formatUnits(afterFrom, decimals), "to:", ethers.formatUnits(afterTo, decimals));

  console.log(
    "Authorization state (used):",
    await forwarder.authorizationState(tokenAddress, signerWallet.address, nonce)
  );

  console.log("\nTesting replay protection...");
  try {
    await forwarder.transferWithAuthorization.staticCall(
      tokenAddress,
      signerWallet.address,
      recipient,
      value,
      validAfter,
      validBefore,
      nonce,
      sig.v,
      sig.r,
      sig.s
    );
    console.error("ERROR: replay should have reverted");
    process.exitCode = 1;
  } catch {
    console.log("Replay correctly reverted (AuthorizationAlreadyUsed)");
  }

  const authFile = path.join(__dirname, "..", "deployments", "last-authorization.json");
  fs.writeFileSync(
    authFile,
    JSON.stringify({ token: tokenAddress, forwarder: deployment.paymentForwarder, ...message, signature, txHash: tx.hash }, null, 2)
  );
  console.log("Saved authorization artifact:", authFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
