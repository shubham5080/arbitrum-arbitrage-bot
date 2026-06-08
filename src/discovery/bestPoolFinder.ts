import { ethers } from "ethers";
import { DEXES, DexId } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { findBestUniswapPool } from "./uniswapPoolDiscovery";
import { findBestSushiPool } from "./sushiPoolDiscovery";
import { findBestCamelotPool } from "./camelotPoolDiscovery";
import { findBestPancakePool } from "./pancakePoolDiscovery";
import { PoolMetadata } from "../types/poolMetadata";

export type PoolCandidate = PoolMetadata;

export async function getHighestLiquidityPoolForDex(
  provider: ethers.Provider,
  tokenSymbol: string,
  dex: string
): Promise<PoolMetadata | null> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[tokenSymbol];
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

  if (dex === DEXES.PANCAKESWAP) {
    return await findBestPancakePool(provider, token.address, ADDRESSES.USDC);
  }

  return null;
}

export async function findBestPoolForToken(
  provider: ethers.Provider,
  tokenSymbol: string
): Promise<PoolMetadata | null> {
  const dexes: DexId[] = [
    DEXES.UNISWAP,
    DEXES.SUSHI,
    DEXES.CAMELOT,
    DEXES.PANCAKESWAP,
  ];

  const candidates = (
    await Promise.all(
      dexes.map((dex) => getHighestLiquidityPoolForDex(provider, tokenSymbol, dex))
    )
  ).filter((candidate): candidate is PoolMetadata => candidate !== null);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1))[0] ?? null;
}
