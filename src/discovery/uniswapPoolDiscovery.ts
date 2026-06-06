import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { getPoolLiquidity } from "../validation/poolValidator";
import { RISK } from "../config/risk";
import { logRejectedRoute } from "../utils/rejectionLogger";

const FEES = [500, 3000, 10000];
const FACTORY_ABI = ["function getPool(address,address,uint24) external view returns (address)"];

export type PoolCandidate = {
  fee: number;
  address: string;
  liquidity: bigint;
  dex: string;
};

export async function findBestUniswapPool(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string
): Promise<PoolCandidate | null> {
  const factory = new ethers.Contract(
    ADDRESSES.UNISWAP_V3_FACTORY,
    FACTORY_ABI,
    provider
  ) as any;

  const candidates: PoolCandidate[] = [];

  for (const fee of FEES) {
    try {
      const poolAddress = await factory.getPool(tokenA, tokenB, fee);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        continue;
      }

      const liquidity = await getPoolLiquidity(provider, poolAddress);
      if (liquidity < RISK.MIN_POOL_LIQUIDITY) {
        logRejectedRoute({ tokenPath: [tokenA, tokenB], poolAddress, liquidity, reason: "liquidity_below_MIN_POOL_LIQUIDITY" });
        continue;
      }
      candidates.push({
        fee,
        address: poolAddress,
        liquidity,
        dex: "UNISWAP",
      });
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1))[0] ?? null;
}
