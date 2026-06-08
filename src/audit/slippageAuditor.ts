import { ethers } from "ethers";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import {
  getUniswapBuyQuote,
  getUniswapSellQuote,
  getSushiBuyQuote,
  getSushiSellQuote,
  getCamelotBuyQuote,
  getCamelotSellQuote,
  getPancakeBuyQuote,
  getPancakeSellQuote,
} from "../quotes/quoteEngine";
import { calculateFlashFee } from "../utils/feeCalculator";
import { estimateExecutionGas } from "../execution/gasEstimator";
import { RouteQuoteContext } from "./quoteConsistency";

const V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

export interface SlippageAuditResult {
  scannerProfit: number;
  realisticProfit: number;
  slippageLoss: number;
  slippageLossPercent: number;
  buyPoolImpact: number;
  sellPoolImpact: number;
  buyFeeBps: number;
  sellFeeBps: number;
  buyLiquidity: string;
  sellLiquidity: string;
}

function v2AmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = 30) {
  const feeMultiplier = 10000n - BigInt(feeBps);
  const amountInWithFee = (amountIn * feeMultiplier) / 10000n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  return numerator / denominator;
}

async function getV2Reserves(
  provider: ethers.Provider,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string
) {
  const pair = new ethers.Contract(poolAddress, V2_PAIR_ABI, provider) as ethers.Contract & {
    token0(): Promise<string>;
    token1(): Promise<string>;
    getReserves(): Promise<{ reserve0: bigint; reserve1: bigint }>;
  };
  const [token0, token1, reserves] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
  ]);

  const token0lc = token0.toLowerCase();
  const token1lc = token1.toLowerCase();
  const inLc = tokenIn.toLowerCase();
  const outLc = tokenOut.toLowerCase();

  if (token0lc === inLc && token1lc === outLc) {
    return {
      reserveIn: BigInt(reserves.reserve0.toString()),
      reserveOut: BigInt(reserves.reserve1.toString()),
    };
  }
  if (token1lc === inLc && token0lc === outLc) {
    return {
      reserveIn: BigInt(reserves.reserve1.toString()),
      reserveOut: BigInt(reserves.reserve0.toString()),
    };
  }

  return null;
}

function poolImpactBps(amountIn: bigint, reserveIn: bigint): number {
  if (reserveIn === 0n) return 100;
  return Number(((amountIn * 10000n) / reserveIn) / 100n);
}

export async function auditSlippage(
  provider: ethers.Provider,
  ctx: RouteQuoteContext,
  scannerNetProfit: number
): Promise<SlippageAuditResult> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[ctx.token];
  if (!token) {
    throw new Error(`Unknown token: ${ctx.token}`);
  }

  const buyPool = await getHighestLiquidityPoolForDex(provider, ctx.token, ctx.buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, ctx.token, ctx.sellDex);
  if (!buyPool || !sellPool) {
    return {
      scannerProfit: scannerNetProfit,
      realisticProfit: Number.NEGATIVE_INFINITY,
      slippageLoss: Math.abs(scannerNetProfit),
      slippageLossPercent: 100,
      buyPoolImpact: 100,
      sellPoolImpact: 100,
      buyFeeBps: 0,
      sellFeeBps: 0,
      buyLiquidity: "0",
      sellLiquidity: "0",
    };
  }

  const gasEstimate = await estimateExecutionGas(provider, ctx.size);
  const flashFee = calculateFlashFee(ctx.size);
  const totalCosts = gasEstimate.gasCostUSD + flashFee;

  const usdcIn = ethers.parseUnits(ctx.size.toString(), 6);
  let realisticTokenOut: bigint;
  let buyImpact = 0;
  let sellImpact = 0;
  let buyFeeBps = buyPool.feeTier ? Math.round(buyPool.feeTier / 100) : 30;
  let sellFeeBps = sellPool.feeTier ? Math.round(sellPool.feeTier / 100) : 30;

  if (ctx.buyDex === DEXES.UNISWAP) {
    realisticTokenOut = await getUniswapBuyQuote(
      provider,
      token.address,
      token.decimals,
      ctx.size.toString(),
      buyPool.feeTier
    );
    buyFeeBps = buyPool.feeTier / 100;
  } else if (ctx.buyDex === DEXES.SUSHI) {
    realisticTokenOut = await getSushiBuyQuote(
      provider,
      token.address,
      token.decimals,
      ctx.size.toString(),
      buyPool
    );
    buyFeeBps = buyPool.feeTier / 100;
  } else if (ctx.buyDex === DEXES.PANCAKESWAP) {
    realisticTokenOut = await getPancakeBuyQuote(
      provider,
      token.address,
      token.decimals,
      ctx.size.toString(),
      buyPool
    );
    buyFeeBps = buyPool.feeTier / 100;
  } else {
    const buyReserves = await getV2Reserves(
      provider,
      buyPool.poolAddress,
      ADDRESSES.USDC,
      token.address
    );
    if (buyReserves) {
      buyImpact = poolImpactBps(usdcIn, buyReserves.reserveIn);
      realisticTokenOut = v2AmountOut(usdcIn, buyReserves.reserveIn, buyReserves.reserveOut, 30);
    } else {
      realisticTokenOut = await getCamelotBuyQuote(
        provider,
        token.address,
        token.decimals,
        ctx.size.toString(),
        buyPool.poolAddress
      );
    }
  }

  const tokenAmountStr = ethers.formatUnits(realisticTokenOut, token.decimals);
  const tokenInSell = ethers.parseUnits(tokenAmountStr, token.decimals);
  let realisticUsdcOut: bigint;

  if (ctx.sellDex === DEXES.UNISWAP) {
    realisticUsdcOut = await getUniswapSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmountStr,
      sellPool.feeTier
    );
    sellFeeBps = sellPool.feeTier / 100;
  } else if (ctx.sellDex === DEXES.SUSHI) {
    realisticUsdcOut = await getSushiSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmountStr,
      sellPool
    );
    sellFeeBps = sellPool.feeTier / 100;
  } else if (ctx.sellDex === DEXES.PANCAKESWAP) {
    realisticUsdcOut = await getPancakeSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmountStr,
      sellPool
    );
    sellFeeBps = sellPool.feeTier / 100;
  } else {
    const sellReserves = await getV2Reserves(
      provider,
      sellPool.poolAddress,
      token.address,
      ADDRESSES.USDC
    );
    if (sellReserves) {
      sellImpact = poolImpactBps(tokenInSell, sellReserves.reserveIn);
      realisticUsdcOut = v2AmountOut(
        tokenInSell,
        sellReserves.reserveIn,
        sellReserves.reserveOut,
        30
      );
    } else {
      realisticUsdcOut = await getCamelotSellQuote(
        provider,
        token.address,
        token.decimals,
        tokenAmountStr,
        sellPool.poolAddress
      );
    }
  }

  const realisticGross = Number(ethers.formatUnits(realisticUsdcOut, 6)) - ctx.size;
  const realisticProfit = Number((realisticGross - totalCosts).toFixed(6));
  const slippageLoss = Number((scannerNetProfit - realisticProfit).toFixed(6));
  const slippageLossPercent =
    scannerNetProfit > 0
      ? Number(((slippageLoss / scannerNetProfit) * 100).toFixed(2))
      : slippageLoss > 0
        ? 100
        : 0;

  return {
    scannerProfit: scannerNetProfit,
    realisticProfit,
    slippageLoss,
    slippageLossPercent,
    buyPoolImpact: Number(buyImpact.toFixed(4)),
    sellPoolImpact: Number(sellImpact.toFixed(4)),
    buyFeeBps,
    sellFeeBps,
    buyLiquidity: buyPool.liquidity.toString(),
    sellLiquidity: sellPool.liquidity.toString(),
  };
}
