import { ADDRESSES } from "./addresses";
import { DEXES } from "./dexes";
import { POOLS } from "./pools";
import { PoolMetadata } from "../types/poolMetadata";

type ConfigPool = { address: string; fee: number };

export function poolMetadataFromConfig(
  tokenSymbol: string,
  dex: string
): PoolMetadata | null {
  const tokenEntry = (POOLS as Record<string, Record<string, ConfigPool | string>>)[tokenSymbol];
  if (!tokenEntry) return null;

  const poolEntry = tokenEntry[dex] as ConfigPool | undefined;
  if (!poolEntry || typeof poolEntry !== "object" || !poolEntry.address) return null;

  const tokenAddress =
    typeof tokenEntry.address === "string" ? tokenEntry.address : null;
  if (!tokenAddress) return null;

  return {
    poolAddress: poolEntry.address,
    dex,
    poolType: "V3",
    feeTier: poolEntry.fee,
    token0: ADDRESSES.USDC,
    token1: tokenAddress,
    liquidity: 0n,
  };
}

export function wethSushiPool(): PoolMetadata {
  const pool = poolMetadataFromConfig("WETH", DEXES.SUSHI);
  if (!pool) throw new Error("WETH SUSHI pool not configured");
  return pool;
}
