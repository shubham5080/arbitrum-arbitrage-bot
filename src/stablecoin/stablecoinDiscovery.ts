import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { DEXES, DexId } from "../config/dexes";
import { getPoolLiquidity } from "../validation/poolValidator";
import { RISK } from "../config/risk";
import { buildPoolMetadata, fetchPoolTokens } from "../discovery/poolMetadataHelpers";
import { PoolMetadata } from "../types/poolMetadata";
import { STABLECOINS } from "./stablecoinConfig";
import { StablecoinPair } from "./stablecoinPairs";
import { quoteV3Dex } from "./stablecoinQuotes";

export interface StablecoinPoolDiscovery {
  pair: StablecoinPair;
  dex: DexId | "CURVE";
  pool: PoolMetadata | null;
  poolAddress?: string;
}

const STABLE_FEES = [100, 500, 3000, 10000];
const FACTORY_ABI = ["function getPool(address,address,uint24) external view returns (address)"];

const DEX_FACTORIES: Record<string, string> = {
  [DEXES.UNISWAP]: ADDRESSES.UNISWAP_V3_FACTORY,
  [DEXES.SUSHI]: ADDRESSES.SUSHI_V3_FACTORY,
  [DEXES.PANCAKESWAP]: ADDRESSES.PANCAKESWAP_V3_FACTORY,
};

const SCAN_DEXES: DexId[] = [DEXES.UNISWAP, DEXES.SUSHI, DEXES.PANCAKESWAP];

async function findBestStablecoinPoolForDex(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string,
  dex: DexId,
  probeAmount = "10000"
): Promise<PoolMetadata | null> {
  const factoryAddress = DEX_FACTORIES[dex];
  if (!factoryAddress) return null;

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider) as any;
  const candidates: PoolMetadata[] = [];

  const tokenAConfig = Object.values(STABLECOINS).find(
    (c) => c.address.toLowerCase() === tokenA.toLowerCase()
  );
  const tokenBConfig = Object.values(STABLECOINS).find(
    (c) => c.address.toLowerCase() === tokenB.toLowerCase()
  );
  if (!tokenAConfig || !tokenBConfig) return null;

  for (const fee of STABLE_FEES) {
    try {
      const poolAddress = await factory.getPool(tokenA, tokenB, fee);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) continue;

      const liquidity = await getPoolLiquidity(provider, poolAddress);
      if (liquidity < RISK.MIN_POOL_LIQUIDITY) continue;

      // Validate quote sanity before accepting pool
      try {
        const amountOut = await quoteV3Dex(
          provider,
          dex,
          tokenA,
          tokenB,
          probeAmount,
          tokenAConfig.decimals,
          fee
        );
        const outHuman = Number(ethers.formatUnits(amountOut, tokenBConfig.decimals));
        const rate = outHuman / Number(probeAmount);
        const deviationBps = Math.abs((rate - 1) * 10_000);
        if (deviationBps > 100) continue;
      } catch {
        continue;
      }

      const { token0, token1 } = await fetchPoolTokens(provider, poolAddress);
      candidates.push(
        buildPoolMetadata(poolAddress, dex, "V3", fee, token0, token1, liquidity)
      );
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1))[0] ?? null;
}

export async function discoverStablecoinPools(
  provider: ethers.Provider,
  pair: StablecoinPair
): Promise<StablecoinPoolDiscovery[]> {
  const base = STABLECOINS[pair.base];
  const quote = STABLECOINS[pair.quote];
  const results: StablecoinPoolDiscovery[] = [];

  for (const dex of SCAN_DEXES) {
    const pool = await findBestStablecoinPoolForDex(
      provider,
      base.address,
      quote.address,
      dex
    );
    results.push({ pair, dex, pool });
  }

  return results;
}

export async function discoverAllStablecoinPools(
  provider: ethers.Provider,
  pairs: StablecoinPair[]
): Promise<StablecoinPoolDiscovery[]> {
  const all: StablecoinPoolDiscovery[] = [];
  for (const pair of pairs) {
    const found = await discoverStablecoinPools(provider, pair);
    all.push(...found);
  }
  return all;
}

export function summarizeDiscovery(
  discoveries: StablecoinPoolDiscovery[]
): { pair: string; dex: string; poolAddress: string; liquidity: string; fee: number }[] {
  return discoveries
    .filter((d) => d.pool !== null)
    .map((d) => ({
      pair: d.pair.label,
      dex: d.dex,
      poolAddress: d.pool!.poolAddress,
      liquidity: d.pool!.liquidity.toString(),
      fee: d.pool!.feeTier,
    }));
}
