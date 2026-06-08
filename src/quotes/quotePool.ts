import { ethers } from "ethers";
import { assertPoolMetadata, PoolMetadata } from "../types/poolMetadata";
import { getSushiV3Quote } from "./sushiV3Quote";

const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

export async function quoteV2(
  provider: ethers.Provider,
  pool: PoolMetadata,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number
): Promise<bigint> {
  assertPoolMetadata(pool);

  const pair = new ethers.Contract(pool.poolAddress, UNISWAP_V2_PAIR_ABI, provider) as any;
  let reserves: { reserve0: bigint; reserve1: bigint };

  try {
    const result = await pair.getReserves();
    reserves = {
      reserve0: BigInt(result.reserve0.toString()),
      reserve1: BigInt(result.reserve1.toString()),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `getReserves() failed for V2 pool ${pool.poolAddress}: ${message}. Quote rejected — no synthetic reserves.`
    );
  }

  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);
  const token0lc = pool.token0.toLowerCase();
  const token1lc = pool.token1.toLowerCase();
  const tokenInAddress = tokenIn.toLowerCase();
  const tokenOutAddress = tokenOut.toLowerCase();

  let reserveIn: bigint;
  let reserveOut: bigint;
  if (token0lc === tokenInAddress && token1lc === tokenOutAddress) {
    reserveIn = reserves.reserve0;
    reserveOut = reserves.reserve1;
  } else if (token1lc === tokenInAddress && token0lc === tokenOutAddress) {
    reserveIn = reserves.reserve1;
    reserveOut = reserves.reserve0;
  } else {
    throw new Error(
      `Pool ${pool.poolAddress} reserves do not match ${tokenIn}/${tokenOut}`
    );
  }

  const amountInWithFee = amountInUnits * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}

export async function quoteV3(
  provider: ethers.Provider,
  pool: PoolMetadata,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number
): Promise<bigint> {
  assertPoolMetadata(pool);
  return getSushiV3Quote(provider, tokenIn, tokenOut, amountIn, tokenInDecimals, pool.feeTier);
}

export async function quotePool(
  provider: ethers.Provider,
  pool: PoolMetadata,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number
): Promise<bigint> {
  assertPoolMetadata(pool);

  if (pool.poolType === "V2") {
    return quoteV2(provider, pool, tokenIn, tokenOut, amountIn, tokenInDecimals);
  }

  if (pool.poolType === "V3") {
    return quoteV3(provider, pool, tokenIn, tokenOut, amountIn, tokenInDecimals);
  }

  throw new Error(`Invalid pool type "${pool.poolType}" for pool ${pool.poolAddress}`);
}
