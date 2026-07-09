import { Contract, HDNodeWallet, JsonRpcProvider, MaxUint256 } from "ethers";
import { CHAIN, PAYMENT_FORWARDER } from "./config";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

let provider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider {
  if (!provider) {
    provider = new JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId);
  }
  return provider;
}

export async function getTokenAllowance(
  owner: string,
  tokenAddress: string,
  spender: string = PAYMENT_FORWARDER
): Promise<bigint> {
  const p = getProvider();
  const token = new Contract(tokenAddress, ERC20_ABI, p);
  return token.allowance(owner, spender);
}

export async function ensureTokenAllowance(
  wallet: HDNodeWallet,
  tokenAddress: string,
  spender: string,
  minAmount: bigint
): Promise<{ approved: boolean; txHash?: string; allowance: bigint }> {
  const signer = wallet.connect(getProvider());
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  const allowance = (await token.allowance(wallet.address, spender)) as bigint;
  if (allowance >= minAmount) {
    return { approved: false, allowance };
  }

  const tx = await token.approve(spender, MaxUint256);
  await tx.wait();
  return { approved: true, txHash: tx.hash as string, allowance: MaxUint256 };
}
