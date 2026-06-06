import { ethers } from "ethers";
import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { findBestUniswapPool } from "./uniswapPoolDiscovery";
import { findBestSushiPool } from "./sushiPoolDiscovery";
import { findBestCamelotPool } from "./camelotPoolDiscovery";

export type PoolCandidate = {
  address: string;
  fee: number;
  dex: string;
  liquidity: bigint;
};

export async function getHighestLiquidityPoolForDex(
  provider: ethers.Provider,
  tokenSymbol: string,
  dex: string
): Promise<PoolCandidate | null> {
  const token = (TOKENS as any)[tokenSymbol];
  if (!token) {
    return null;
  }

  if (dex === DEXES.UNISWAP) {
    return await findBestUniswapPool(provider, token.address, ADDRESSES.USDC);
  }

  if (dex === DEXES.SUSHI) {
    return await findBestSushiPool(provider, token.address, ADDRESSES.USDC);
  }

  if (dex === DEXES.CAMELOT) {
    return await findBestCamelotPool(provider, token.address, ADDRESSES.USDC);
  }

  return null;
}

export async function findBestPoolForToken(
  provider: ethers.Provider,
  tokenSymbol: string
): Promise<PoolCandidate | null> {
  const uniswapPool = await getHighestLiquidityPoolForDex(provider, tokenSymbol, DEXES.UNISWAP);
  const sushiPool = await getHighestLiquidityPoolForDex(provider, tokenSymbol, DEXES.SUSHI);
  const camelotPool = await getHighestLiquidityPoolForDex(provider, tokenSymbol, DEXES.CAMELOT);

  const candidates = [uniswapPool, sushiPool, camelotPool].filter(
    (candidate): candidate is PoolCandidate => candidate !== null
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1))[0] ?? null;
}
