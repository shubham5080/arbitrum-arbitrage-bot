import { ethers } from "ethers";
import { PoolMetadata, PoolType } from "../types/poolMetadata";
import { getPoolLiquidity } from "../validation/poolValidator";

const POOL_TOKEN_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

export async function fetchPoolTokens(
  provider: ethers.Provider,
  poolAddress: string
): Promise<{ token0: string; token1: string }> {
  const pool = new ethers.Contract(poolAddress, POOL_TOKEN_ABI, provider) as any;
  const [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
  return { token0, token1 };
}

export function buildPoolMetadata(
  poolAddress: string,
  dex: string,
  poolType: PoolType,
  feeTier: number,
  token0: string,
  token1: string,
  liquidity: bigint
): PoolMetadata {
  return {
    poolAddress,
    dex,
    poolType,
    feeTier,
    token0,
    token1,
    liquidity,
  };
}

/** Enrich a known pool address with on-chain token data — does not re-discover pools. */
export async function enrichPoolMetadataFromAddress(
  provider: ethers.Provider,
  poolAddress: string,
  dex: string,
  poolType: PoolType,
  feeTier: number
): Promise<PoolMetadata> {
  const [{ token0, token1 }, liquidity] = await Promise.all([
    fetchPoolTokens(provider, poolAddress),
    getPoolLiquidity(provider, poolAddress),
  ]);
  return buildPoolMetadata(poolAddress, dex, poolType, feeTier, token0, token1, liquidity);
}
