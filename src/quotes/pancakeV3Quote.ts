import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { assertPoolMetadata, PoolMetadata } from "../types/poolMetadata";

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
];

export async function getPancakeV3Quote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number,
  fee: number
): Promise<bigint> {
  const iface = new ethers.Interface(QUOTER_ABI);
  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn,
    tokenOut,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][PancakeV3] params:", {
    tokenIn,
    tokenOut,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData,
  });

  let res: string;
  try {
    res = (await provider.call({
      to: ADDRESSES.PANCAKESWAP_V3_QUOTER,
      data: callData,
    })) as string;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[QUOTER][PancakeV3] provider.call failed", {
      tokenIn,
      tokenOut,
      amountIn,
      fee,
      err: message,
    });
    throw err;
  }

  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);
  console.debug("[QUOTER][PancakeV3] decoded amountOut:", decoded[0].toString());
  return decoded[0] as bigint;
}

export async function quotePancakePool(
  provider: ethers.Provider,
  pool: PoolMetadata,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number
): Promise<bigint> {
  assertPoolMetadata(pool);
  if (pool.poolType !== "V3") {
    throw new Error(`PancakeSwap pool ${pool.poolAddress} must be V3, got ${pool.poolType}`);
  }
  return getPancakeV3Quote(
    provider,
    tokenIn,
    tokenOut,
    amountIn,
    tokenInDecimals,
    pool.feeTier
  );
}
