import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";

const DECIMALS = 6;
const MINT_AMOUNT = ethers.parseUnits("1000", DECIMALS);
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const [deployer] = await ethers.getSigners();
  const recipient = deployer.address;

  console.log("Deploying AE Coin with:", recipient);
  console.log("Network:", network.name);

  const balance = await ethers.provider.getBalance(recipient);
  console.log("MATIC balance:", ethers.formatEther(balance));

  const factory = await ethers.getContractFactory("AECoin");
  const aeCoin = await factory.deploy();
  await aeCoin.waitForDeployment();

  const address = await aeCoin.getAddress();
  console.log("AECoin deployed to:", address);

  const tx = await aeCoin.mint(recipient, MINT_AMOUNT);
  await tx.wait();

  console.log("Minted 1000 AE to:", recipient);
  console.log("Balance:", ethers.formatUnits(await aeCoin.balanceOf(recipient), DECIMALS), "AE");
  console.log("Explorer:", `https://amoy.polygonscan.com/address/${address}`);

  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  const deployment = fs.existsSync(deploymentPath)
    ? JSON.parse(fs.readFileSync(deploymentPath, "utf8"))
    : {};

  deployment.aeCoin = address;
  deployment.aeCoinExplorerUrl = `https://amoy.polygonscan.com/address/${address}`;
  deployment.aeCoinMintedTo = recipient;
  deployment.aeCoinMintedAmount = "1000";

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
