import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { PoolMetadata } from "../types/poolMetadata";
import { quotePool } from "./quotePool";
import { quotePancakePool } from "./pancakeV3Quote";
export { getCamelotBuyQuote, getCamelotSellQuote } from "./camelotQuote";
export { quotePool, quoteV2, quoteV3 } from "./quotePool";
export { getPancakeV3Quote, quotePancakePool } from "./pancakeV3Quote";

const UNISWAP_QUOTER = ADDRESSES.UNISWAP_V3_QUOTER;

const USDC = ADDRESSES.USDC;

const UNISWAP_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)"
];

export async function getUniswapBuyQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  fee = 500
) {
  const iface = new ethers.Interface(UNISWAP_ABI);

  const amountInUnits = ethers.parseUnits(amountIn, 6);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: USDC,
    tokenOut: tokenAddress,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][Uniswap][BUY] params:", {
    tokenIn: USDC,
    tokenOut: tokenAddress,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData: callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: UNISWAP_QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][Uniswap][BUY] provider.call failed", {
      tokenIn: USDC,
      tokenOut: tokenAddress,
      amountIn,
      amountInUnits: amountInUnits.toString(),
      fee,
      callData,
      err: err && err.message ? err.message : err,
    });
    throw err;
  }

  console.debug("[QUOTER][Uniswap][BUY] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);

  console.debug("[QUOTER][Uniswap][BUY] decoded amountOut:", decoded[0].toString());

  return decoded[0] as bigint;
}

export async function getUniswapSellQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  fee = 500
) {
  const iface = new ethers.Interface(UNISWAP_ABI);

  const amountInUnits = ethers.parseUnits(amountIn, tokenDecimals);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: tokenAddress,
    tokenOut: USDC,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][Uniswap][SELL] params:", {
    tokenIn: tokenAddress,
    tokenOut: USDC,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData: callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: UNISWAP_QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][Uniswap][SELL] provider.call failed", {
      tokenIn: tokenAddress,
      tokenOut: USDC,
      amountIn,
      amountInUnits: amountInUnits.toString(),
      fee,
      callData,
      err: err && err.message ? err.message : err,
    });
    throw err;
  }

  console.debug("[QUOTER][Uniswap][SELL] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);

  console.debug("[QUOTER][Uniswap][SELL] decoded amountOut:", decoded[0].toString());

  return decoded[0] as bigint;
}

export async function getSushiBuyQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  pool: PoolMetadata
) {
  return quotePool(provider, pool, ADDRESSES.USDC, tokenAddress, amountIn, 6);
}

export async function getSushiSellQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  pool: PoolMetadata
) {
  return quotePool(provider, pool, tokenAddress, ADDRESSES.USDC, amountIn, tokenDecimals);
}

export async function getPancakeBuyQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  pool: PoolMetadata
) {
  return quotePancakePool(provider, pool, ADDRESSES.USDC, tokenAddress, amountIn, 6);
}

export async function getPancakeSellQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  pool: PoolMetadata
) {
  return quotePancakePool(
    provider,
    pool,
    tokenAddress,
    ADDRESSES.USDC,
    amountIn,
    tokenDecimals
  );
}

export async function getSushiQuote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  tokenInDecimals: number,
  _tokenOutDecimals: number,
  amountIn: string,
  pool: PoolMetadata
) {
  return quotePool(provider, pool, tokenIn, tokenOut, amountIn, tokenInDecimals);
}

export async function getUniswapQuote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number,
  _tokenOutDecimals: number,
  fee = 500
) {
  const iface = new ethers.Interface(UNISWAP_ABI);
  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn,
    tokenOut,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][Uniswap][QUOTE] params:", {
    tokenIn,
    tokenOut,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: UNISWAP_QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][Uniswap][QUOTE] provider.call failed", {
      tokenIn,
      tokenOut,
      amountIn,
      amountInUnits: amountInUnits.toString(),
      fee,
      callData,
      err: err && err.message ? err.message : err,
    });
    throw err;
  }

  console.debug("[QUOTER][Uniswap][QUOTE] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);
  console.debug("[QUOTER][Uniswap][QUOTE] decoded amountOut:", decoded[0].toString());
  return decoded[0] as bigint;
}
