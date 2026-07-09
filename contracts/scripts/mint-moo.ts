import { ethers, network } from "hardhat";
import * as path from "path";
import * as fs from "fs";

const DECIMALS = 6;
const RECIPIENT = "0xC54E102d2343138114774868c5810B3262E89512";
const AMOUNT = "100";

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as {
    testToken?: string;
  };

  if (!deployment.testToken) {
    throw new Error(`testToken missing in deployment file: ${deploymentPath}`);
  }

  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("PayToken", deployment.testToken, signer);
  const amount = ethers.parseUnits(AMOUNT, DECIMALS);

  console.log("Network:", network.name);
  console.log("Signer:", signer.address);
  console.log("Token:", deployment.testToken);
  console.log("Recipient:", RECIPIENT);
  console.log("Amount:", AMOUNT, "MOO");

  const tx = await token.mint(RECIPIENT, amount);
  console.log("Mint tx:", tx.hash);
  await tx.wait();

  const balance = await token.balanceOf(RECIPIENT);
  console.log("Recipient balance:", ethers.formatUnits(balance, DECIMALS), "MOO");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
