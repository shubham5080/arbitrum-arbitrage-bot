import { ethers } from "ethers";
import { DexId, DEXES } from "../config/dexes";
import { PoolMetadata } from "../types/poolMetadata";
import { findBestUniswapPool } from "../discovery/uniswapPoolDiscovery";
import { findBestSushiPool } from "../discovery/sushiPoolDiscovery";
import { findBestPancakePool } from "../discovery/pancakePoolDiscovery";
import { findBestCamelotPool } from "../discovery/camelotPoolDiscovery";

const poolCache = new Map<string, PoolMetadata | null>();

function cacheKey(dex: string, tokenA: string, tokenB: string): string {
  const [a, b] = [tokenA.toLowerCase(), tokenB.toLowerCase()].sort();
  return `${dex}:${a}:${b}`;
}

export async function findPoolForPairOnDex(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string,
  dex: DexId,
  useCache = true
): Promise<PoolMetadata | null> {
  const key = cacheKey(dex, tokenA, tokenB);
  if (useCache && poolCache.has(key)) {
    return poolCache.get(key) ?? null;
  }

  let pool: PoolMetadata | null = null;
  if (dex === DEXES.UNISWAP) {
    pool = await findBestUniswapPool(provider, tokenA, tokenB);
  } else if (dex === DEXES.SUSHI) {
    pool = await findBestSushiPool(provider, tokenA, tokenB);
  } else if (dex === DEXES.PANCAKESWAP) {
    pool = await findBestPancakePool(provider, tokenA, tokenB);
  } else if (dex === DEXES.CAMELOT) {
    pool = await findBestCamelotPool(provider, tokenA, tokenB);
  }

  if (useCache) poolCache.set(key, pool);
  return pool;
}

export function clearPoolCache(): void {
  poolCache.clear();
}
