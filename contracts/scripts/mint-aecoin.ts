import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";

const DECIMALS = 6;
const RECIPIENT = "0xC54E102d2343138114774868c5810B3262E89512";
const EXPECTED_DEPLOYER = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
const MINT_AMOUNT = ethers.parseUnits("100", DECIMALS);
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const [deployer] = await ethers.getSigners();

  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    throw new Error(
      `Deployer mismatch: expected ${EXPECTED_DEPLOYER}, got ${deployer.address}. Check PRIVATE_KEY in root .env.`
    );
  }

  console.log("Deploying AE Coin with:", deployer.address);
  console.log("Mint recipient:", RECIPIENT);
  console.log("Network:", network.name);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("MATIC balance:", ethers.formatEther(balance));

  const factory = await ethers.getContractFactory("AECoin");
  const aeCoin = await factory.deploy();
  await aeCoin.waitForDeployment();

  const address = await aeCoin.getAddress();
  console.log("AECoin deployed to:", address);

  const tx = await aeCoin.mint(RECIPIENT, MINT_AMOUNT);
  await tx.wait();

  console.log("Minted 100 AE to:", RECIPIENT);
  console.log("Balance:", ethers.formatUnits(await aeCoin.balanceOf(RECIPIENT), DECIMALS), "AE");
  console.log("Explorer:", `https://amoy.polygonscan.com/address/${address}`);

  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  const deployment = fs.existsSync(deploymentPath)
    ? JSON.parse(fs.readFileSync(deploymentPath, "utf8"))
    : {};

  deployment.aeCoin = address;
  deployment.aeCoinExplorerUrl = `https://amoy.polygonscan.com/address/${address}`;
  deployment.aeCoinMintedTo = RECIPIENT;
  deployment.aeCoinMintedAmount = "100";

  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("Updated:", deploymentPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
