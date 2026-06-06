import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";

const USDC = ADDRESSES.USDC;

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

async function getPoolPrice(
  provider: ethers.Provider,
  poolAddress: string,
  tokenIn: string,
  tokenInDecimals: number
) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  const [token0, token1, slot0] = await Promise.all([
    pool.token0(),
    pool.token1(),
    pool.slot0(),
  ]);

  const sqrtPriceX96 = BigInt(slot0[0].toString());
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;

  const token0Decimals = token0.toLowerCase() === USDC.toLowerCase() ? 6 : tokenInDecimals;
  const token1Decimals = token1.toLowerCase() === USDC.toLowerCase() ? 6 : tokenInDecimals;
  const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
  const humanPrice = price * decimalAdjustment;

  if (token0.toLowerCase() === tokenIn.toLowerCase() && token1.toLowerCase() === USDC.toLowerCase()) {
    return humanPrice;
  }

  if (token1.toLowerCase() === tokenIn.toLowerCase() && token0.toLowerCase() === USDC.toLowerCase()) {
    return 1 / humanPrice;
  }

  throw new Error(
    `Pool ${poolAddress} does not match token ${tokenIn} / USDC order.`
  );
}

export async function getCamelotBuyQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  poolAddress: string
) {
  const price = await getPoolPrice(provider, poolAddress, tokenAddress, tokenDecimals);
  const amountOut = Number(amountIn) / price;

  return ethers.parseUnits(amountOut.toFixed(tokenDecimals), tokenDecimals);
}

export async function getCamelotSellQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  poolAddress: string
) {
  const price = await getPoolPrice(provider, poolAddress, tokenAddress, tokenDecimals);
  const usdcOut = Number(amountIn) * price;

  return ethers.parseUnits(usdcOut.toFixed(6), 6);
}
