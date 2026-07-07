import * as fs from "fs";
import * as path from "path";
import hre, { ethers, network } from "hardhat";

const DECIMALS = 6;
const MINT_AMOUNT = ethers.parseUnits("10000", DECIMALS);
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Network:", network.name, "chainId:", (await ethers.provider.getNetwork()).chainId);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "MATIC");

  const forwarderFactory = await ethers.getContractFactory("PaymentForwarder");
  const forwarder = await forwarderFactory.deploy();
  await forwarder.waitForDeployment();
  const forwarderAddress = await forwarder.getAddress();
  console.log("PaymentForwarder deployed to:", forwarderAddress);

  const deployment: Record<string, unknown> = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    paymentForwarder: forwarderAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    forwarderExplorerUrl: `https://amoy.polygonscan.com/address/${forwarderAddress}`,
  };

  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }

  const outPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  const save = () => fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  save();

  const tokenFactory = await ethers.getContractFactory("PayToken");
  const testToken = await tokenFactory.deploy();
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log("PayToken (test ERC-20) deployed to:", testTokenAddress);

  await (await testToken.mint(deployer.address, MINT_AMOUNT)).wait();
  console.log("Minted", ethers.formatUnits(MINT_AMOUNT, DECIMALS), "MOO to deployer");

  deployment.testToken = testTokenAddress;
  deployment.testTokenExplorerUrl = `https://amoy.polygonscan.com/address/${testTokenAddress}`;
  save();
  console.log("Saved deployment artifact:", outPath);

  const contracts = [
    { name: "PaymentForwarder", address: forwarderAddress, args: [] },
    { name: "PayToken", address: testTokenAddress, args: [] },
  ];

  if (process.env.POLYGONSCAN_API_KEY) {
    for (const c of contracts) {
      console.log(`Verifying ${c.name}...`);
      try {
        await hre.run("verify:verify", { address: c.address, constructorArguments: c.args });
        console.log(`${c.name} verified`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Already Verified")) {
          console.log(`${c.name} already verified`);
        } else {
          console.warn(`${c.name} verification failed:`, message);
        }
      }
    }
  } else {
    console.log("Skipping verification — set POLYGONSCAN_API_KEY in .env");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
