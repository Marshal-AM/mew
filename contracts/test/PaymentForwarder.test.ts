import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { PaymentForwarder, PayToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TypedDataDomain, TypedDataField } from "ethers";

const FORWARDER_NAME = "Moo Payment Forwarder";
const FORWARDER_VERSION = "1";
const DECIMALS = 6;

describe("PaymentForwarder", function () {
  let forwarder: PaymentForwarder;
  let tokenA: PayToken;
  let tokenB: PayToken;
  let owner: HardhatEthersSigner;
  let sender: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let other: HardhatEthersSigner;
  let chainId: bigint;

  const mintAmount = ethers.parseUnits("1000", DECIMALS);
  const transferAmount = ethers.parseUnits("10", DECIMALS);

  async function getDomain(): Promise<TypedDataDomain> {
    return {
      name: FORWARDER_NAME,
      version: FORWARDER_VERSION,
      chainId,
      verifyingContract: await forwarder.getAddress(),
    };
  }

  const transferTypes: Record<string, TypedDataField[]> = {
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

  const receiveTypes: Record<string, TypedDataField[]> = {
    ReceiveWithAuthorization: [
      { name: "token", type: "address" },
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  async function signTransfer(
    signer: HardhatEthersSigner,
    token: string,
    from: string,
    to: string,
    value: bigint,
    validAfter: bigint,
    validBefore: bigint,
    nonce: string
  ) {
    const domain = await getDomain();
    const message = { token, from, to, value, validAfter, validBefore, nonce };
    const signature = await signer.signTypedData(domain, transferTypes, message);
    return ethers.Signature.from(signature);
  }

  beforeEach(async function () {
    [owner, sender, recipient, other] = await ethers.getSigners();

    const forwarderFactory = await ethers.getContractFactory("PaymentForwarder");
    forwarder = await forwarderFactory.deploy();
    await forwarder.waitForDeployment();

    const tokenFactory = await ethers.getContractFactory("PayToken");
    tokenA = await tokenFactory.deploy();
    await tokenA.waitForDeployment();
    tokenB = await tokenFactory.deploy();
    await tokenB.waitForDeployment();

    chainId = (await ethers.provider.getNetwork()).chainId;

    await tokenA.mint(sender.address, mintAmount);
    await tokenB.mint(sender.address, mintAmount);
    await tokenA.connect(sender).approve(await forwarder.getAddress(), ethers.MaxUint256);
    await tokenB.connect(sender).approve(await forwarder.getAddress(), ethers.MaxUint256);
  });

  it("relays an offline authorization for token A", async function () {
    const token = await tokenA.getAddress();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) + 3600);
    const sig = await signTransfer(
      sender, token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce
    );

    await forwarder.transferWithAuthorization(
      token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
    );

    expect(await tokenA.balanceOf(recipient.address)).to.equal(transferAmount);
    expect(await forwarder.authorizationState(token, sender.address, nonce)).to.equal(true);
  });

  it("relays an offline authorization for token B with the same forwarder", async function () {
    const token = await tokenB.getAddress();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) + 3600);
    const sig = await signTransfer(
      sender, token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce
    );

    await forwarder.transferWithAuthorization(
      token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
    );

    expect(await tokenB.balanceOf(recipient.address)).to.equal(transferAmount);
  });

  it("reverts when replaying the same authorization", async function () {
    const token = await tokenA.getAddress();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) + 3600);
    const sig = await signTransfer(
      sender, token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce
    );

    const args = [
      token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s,
    ] as const;

    await forwarder.transferWithAuthorization(...args);
    await expect(forwarder.transferWithAuthorization(...args))
      .to.be.revertedWithCustomError(forwarder, "AuthorizationAlreadyUsed");
  });

  it("reverts when allowance is missing", async function () {
    const token = await tokenA.getAddress();
    await tokenA.connect(sender).approve(await forwarder.getAddress(), 0);

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) + 3600);
    const sig = await signTransfer(
      sender, token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce
    );

    await expect(
      forwarder.transferWithAuthorization(
        token, sender.address, recipient.address,
        transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
      )
    ).to.be.revertedWithCustomError(forwarder, "InsufficientAllowance");
  });

  it("reverts when validBefore is in the past", async function () {
    const token = await tokenA.getAddress();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) - 1);
    const sig = await signTransfer(
      sender, token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce
    );

    await expect(
      forwarder.transferWithAuthorization(
        token, sender.address, recipient.address,
        transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
      )
    ).to.be.revertedWithCustomError(forwarder, "AuthorizationExpired");
  });

  it("reverts when signature is from the wrong signer", async function () {
    const token = await tokenA.getAddress();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) + 3600);
    const sig = await signTransfer(
      other, token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce
    );

    await expect(
      forwarder.transferWithAuthorization(
        token, sender.address, recipient.address,
        transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
      )
    ).to.be.revertedWithCustomError(forwarder, "InvalidSignature");
  });

  it("receiveWithAuthorization requires msg.sender to be the payee", async function () {
    const token = await tokenA.getAddress();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt((await time.latest()) + 3600);
    const domain = await getDomain();
    const message = {
      token, from: sender.address, to: recipient.address,
      value: transferAmount, validAfter, validBefore, nonce,
    };
    const signature = await sender.signTypedData(domain, receiveTypes, message);
    const sig = ethers.Signature.from(signature);

    await expect(
      forwarder.connect(other).receiveWithAuthorization(
        token, sender.address, recipient.address,
        transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
      )
    ).to.be.revertedWithCustomError(forwarder, "CallerMustBePayee");

    await forwarder.connect(recipient).receiveWithAuthorization(
      token, sender.address, recipient.address,
      transferAmount, validAfter, validBefore, nonce, sig.v, sig.r, sig.s
    );

    expect(await tokenA.balanceOf(recipient.address)).to.equal(transferAmount);
  });
});
