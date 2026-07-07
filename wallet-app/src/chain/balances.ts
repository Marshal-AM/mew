import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { CHAIN, TOKENS, TokenConfig } from "./config";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export type TokenBalance = {
  symbol: string;
  balance: string;
  raw: bigint;
  decimals: number;
  error?: string;
};

let provider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider {
  if (!provider) {
    provider = new JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId);
  }
  return provider;
}

async function fetchTokenBalance(
  address: string,
  token: TokenConfig
): Promise<TokenBalance> {
  const p = getProvider();

  if (token.native) {
    const raw = await p.getBalance(address);
    return {
      symbol: token.symbol,
      balance: formatUnits(raw, token.decimals),
      raw,
      decimals: token.decimals,
    };
  }

  const contract = new Contract(token.address, ERC20_ABI, p);
  const raw = (await contract.balanceOf(address)) as bigint;
  return {
    symbol: token.symbol,
    balance: formatUnits(raw, token.decimals),
    raw,
    decimals: token.decimals,
  };
}

export async function fetchAllBalances(address: string): Promise<TokenBalance[]> {
  const results = await Promise.allSettled(
    TOKENS.map((token) => fetchTokenBalance(address, token))
  );

  return results.map((result, i) => {
    const token = TOKENS[i];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      symbol: token.symbol,
      balance: "—",
      raw: 0n,
      decimals: token.decimals,
      error: result.reason instanceof Error ? result.reason.message : "Failed to fetch",
    };
  });
}
