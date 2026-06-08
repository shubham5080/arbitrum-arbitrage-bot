import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { DEXES } from "../config/dexes";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { findBestSushiPool } from "../discovery/sushiPoolDiscovery";
import { findBestUniswapPool } from "../discovery/uniswapPoolDiscovery";
import { findBestCamelotPool } from "../discovery/camelotPoolDiscovery";
import { StoredOpportunity } from "../database/database";
import { TOKENS } from "../config/tokens";
import { detectPoolType } from "./quoteTrace";

export interface PoolConsistencyResult {
  token: string;
  route: string;
  size: number;
  dex: string;
  leg: "buy" | "sell";
  discoveredPool: string | null;
  discoveredFee: number | null;
  storedPool: string | null;
  quotedPool: string | null;
  match: boolean;
  poolType: string;
  mismatchReason: string | null;
}

function parseRoute(route: string) {
  const [buyDex, sellDex] = route.split("->").map((s) => s.trim());
  if (!buyDex || !sellDex) {
    throw new Error(`Invalid route: ${route}`);
  }
  return { buyDex, sellDex };
}

async function discoverPool(
  provider: ethers.Provider,
  dex: string,
  tokenAddress: string
) {
  if (dex === DEXES.UNISWAP) {
    return findBestUniswapPool(provider, tokenAddress, ADDRESSES.USDC);
  }
  if (dex === DEXES.SUSHI) {
    return findBestSushiPool(provider, tokenAddress, ADDRESSES.USDC);
  }
  if (dex === DEXES.CAMELOT) {
    return findBestCamelotPool(provider, tokenAddress, ADDRESSES.USDC);
  }
  return null;
}

export async function auditPoolConsistency(
  provider: ethers.Provider,
  opportunity: StoredOpportunity
): Promise<PoolConsistencyResult[]> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[opportunity.token];
  if (!token) return [];

  const { buyDex, sellDex } = parseRoute(opportunity.route);
  const results: PoolConsistencyResult[] = [];

  for (const [dex, leg] of [
    [buyDex, "buy"] as const,
    [sellDex, "sell"] as const,
  ]) {
    const discovered = await discoverPool(provider, dex, token.address);
    const viaFinder = await getHighestLiquidityPoolForDex(provider, opportunity.token, dex);
    const storedPool = leg === "buy" ? viaFinder?.poolAddress ?? null : null;
    const quotedPool = viaFinder?.poolAddress ?? null;

    const discoveredAddr = discovered?.poolAddress ?? null;
    const match =
      discoveredAddr !== null &&
      quotedPool !== null &&
      discoveredAddr.toLowerCase() === quotedPool.toLowerCase() &&
      (storedPool === null || storedPool.toLowerCase() === quotedPool.toLowerCase());

    let mismatchReason: string | null = null;
    if (!match) {
      if (!discoveredAddr) mismatchReason = "factory discovery returned null";
      else if (!quotedPool) mismatchReason = "bestPoolFinder returned null";
      else if (discoveredAddr.toLowerCase() !== quotedPool.toLowerCase())
        mismatchReason = "factory vs bestPoolFinder address mismatch";
      else if (storedPool && storedPool.toLowerCase() !== quotedPool.toLowerCase())
        mismatchReason = "stored opportunity pool differs from current discovery";
    }

    const poolType = quotedPool ? await detectPoolType(provider, quotedPool) : "unknown";

    results.push({
      token: opportunity.token,
      route: opportunity.route,
      size: opportunity.size,
      dex,
      leg,
      discoveredPool: discoveredAddr,
      discoveredFee: discovered?.feeTier ?? null,
      storedPool,
      quotedPool,
      match,
      poolType,
      mismatchReason,
    });
  }

  return results;
}
