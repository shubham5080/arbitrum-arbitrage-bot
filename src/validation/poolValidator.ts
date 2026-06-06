import { ethers } from "ethers";
import { RISK } from "../config/risk";
import { logRejectedRoute } from "../utils/rejectionLogger";

const POOL_ABI = [
  "function liquidity() view returns (uint128)",
];

export async function getPoolLiquidity(
  provider: ethers.Provider,
  poolAddress: string
) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;

  try {
    return (await pool.liquidity()) as bigint;
  } catch {
    return 0n;
  }
}

export async function isPoolTradable(
  provider: ethers.Provider,
  poolAddress: string
) {
  const liquidity = await getPoolLiquidity(provider, poolAddress);
  const ok = liquidity > RISK.MIN_POOL_LIQUIDITY;
  if (!ok) {
    try {
      logRejectedRoute({ poolAddress, liquidity: liquidity?.toString?.() ?? String(liquidity), reason: "liquidity_below_MIN_POOL_LIQUIDITY" });
    } catch {}
  }
  return ok;
}
