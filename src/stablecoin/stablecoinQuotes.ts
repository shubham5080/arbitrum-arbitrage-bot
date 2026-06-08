import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { DEXES } from "../config/dexes";
import { PoolMetadata } from "../types/poolMetadata";
import { quotePool } from "../quotes/quotePool";
import { getPancakeV3Quote } from "../quotes/pancakeV3Quote";

const V3_QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
];

const DEX_QUOTERS: Record<string, string> = {
  [DEXES.UNISWAP]: ADDRESSES.UNISWAP_V3_QUOTER,
  [DEXES.SUSHI]: ADDRESSES.UNISWAP_V3_QUOTER,
  [DEXES.PANCAKESWAP]: ADDRESSES.PANCAKESWAP_V3_QUOTER,
};

/** Reject quotes implying >1% depeg — likely bad pool or failed quote */
const MAX_SANE_DEVIATION_BPS = 100;

export async function quoteV3Dex(
  provider: ethers.Provider,
  dex: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number,
  fee: number
): Promise<bigint> {
  if (dex === DEXES.PANCAKESWAP) {
    return getPancakeV3Quote(provider, tokenIn, tokenOut, amountIn, tokenInDecimals, fee);
  }

  const quoter = DEX_QUOTERS[dex] ?? ADDRESSES.UNISWAP_V3_QUOTER;
  const iface = new ethers.Interface(V3_QUOTER_ABI);
  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);
  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn,
    tokenOut,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);
  const res = (await provider.call({ to: quoter, data: callData })) as string;
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);
  return decoded[0] as bigint;
}

export async function quoteStablecoinPool(
  provider: ethers.Provider,
  dex: string,
  pool: PoolMetadata,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number,
  tokenOutDecimals: number
): Promise<bigint | null> {
  try {
    let amountOut: bigint;
    if (pool.poolType === "V3") {
      amountOut = await quoteV3Dex(
        provider,
        dex,
        tokenIn,
        tokenOut,
        amountIn,
        tokenInDecimals,
        pool.feeTier
      );
    } else {
      amountOut = await quotePool(
        provider,
        pool,
        tokenIn,
        tokenOut,
        amountIn,
        tokenInDecimals
      );
    }

    const outHuman = Number(ethers.formatUnits(amountOut, tokenOutDecimals));
    const inHuman = Number(amountIn);
    const rate = outHuman / inHuman;
    const deviationBps = Math.abs((rate - 1) * 10_000);
    if (deviationBps > MAX_SANE_DEVIATION_BPS) {
      return null;
    }

    return amountOut;
  } catch {
    return null;
  }
}
