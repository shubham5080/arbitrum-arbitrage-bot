import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { getPoolLiquidity } from "../validation/poolValidator";
import { RISK } from "../config/risk";
import { logRejectedRoute } from "../utils/rejectionLogger";
import { PoolMetadata } from "../types/poolMetadata";
import { buildPoolMetadata, fetchPoolTokens } from "./poolMetadataHelpers";

const FEES = [500, 3000, 10000];
const FACTORY_ABI = ["function getPool(address,address,uint24) external view returns (address)"];

export type PoolCandidate = PoolMetadata;

async function getPoolAddress(
  factory: any,
  tokenA: string,
  tokenB: string,
  fee: number
): Promise<string | null> {
  try {
    const poolAddress = await factory.getPool(tokenA, tokenB, fee);
    if (poolAddress && poolAddress !== ethers.ZeroAddress) {
      return poolAddress;
    }
  } catch {
    // try the reverse token ordering if the factory requires token sorting
  }

  try {
    const poolAddress = await factory.getPool(tokenB, tokenA, fee);
    if (poolAddress && poolAddress !== ethers.ZeroAddress) {
      return poolAddress;
    }
  } catch {
    return null;
  }

  return null;
}

export async function findBestCamelotPool(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string
): Promise<PoolMetadata | null> {
  const factory = new ethers.Contract(
    ADDRESSES.CAMELOT_AMMV2_FACTORY,
    FACTORY_ABI,
    provider
  ) as any;

  const candidates: PoolMetadata[] = [];

  for (const fee of FEES) {
    try {
      const poolAddress = await getPoolAddress(factory, tokenA, tokenB, fee);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        continue;
      }

      const liquidity = await getPoolLiquidity(provider, poolAddress);
      if (liquidity < RISK.MIN_POOL_LIQUIDITY) {
        logRejectedRoute({ tokenPath: [tokenA, tokenB], poolAddress, liquidity, reason: "liquidity_below_MIN_POOL_LIQUIDITY" });
        continue;
      }

      const { token0, token1 } = await fetchPoolTokens(provider, poolAddress);
      candidates.push(
        buildPoolMetadata(poolAddress, "CAMELOT", "V3", fee, token0, token1, liquidity)
      );
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1))[0] ?? null;
}
