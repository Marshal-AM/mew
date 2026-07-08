import { Contract, JsonRpcProvider } from "ethers";
import { CHAIN, PAYMENT_FORWARDER } from "./config";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
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
