import { ethers } from "ethers";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import {
  getCamelotBuyQuote,
  getCamelotSellQuote,
  getPancakeBuyQuote,
  getPancakeSellQuote,
  getSushiBuyQuote,
  getSushiSellQuote,
  getUniswapBuyQuote,
  getUniswapSellQuote,
} from "../quotes/quoteEngine";
import { TOKENS } from "../config/tokens";
import { DEXES } from "../config/dexes";
import { calculateFlashFee } from "../utils/feeCalculator";
import { estimateExecutionGas } from "../execution/gasEstimator";

export const QUOTE_DELAY_MS = [0, 500, 1000, 2000] as const;

export interface QuoteSnapshot {
  delayMs: number;
  grossProfit: number;
  gasAdjustedProfit: number;
  profitDecayPercent: number;
  stillProfitable: boolean;
  buyTokenOut: number;
  sellUsdcOut: number;
}

export interface RouteQuoteContext {
  token: string;
  route: string;
  size: number;
  buyDex: string;
  sellDex: string;
}

function parseRoute(route: string) {
  const parts = route.split("->").map((p) => p.trim());
  return { buyDex: parts[0] ?? "", sellDex: parts[1] ?? "" };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class QuoteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteFetchError";
  }
}

async function fetchRoundtripQuotes(
  provider: ethers.Provider,
  ctx: RouteQuoteContext
): Promise<{ buyTokenOut: number; sellUsdcOut: number }> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[ctx.token];
  if (!token) {
    throw new QuoteFetchError(`Unknown token: ${ctx.token}`);
  }

  const buyPool = await getHighestLiquidityPoolForDex(provider, ctx.token, ctx.buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, ctx.token, ctx.sellDex);
  if (!buyPool || !sellPool) {
    throw new QuoteFetchError(`Pool unavailable for ${ctx.token} ${ctx.route}`);
  }

  const amountIn = ctx.size.toString();
  let buyTokenOut: bigint;

  if (ctx.buyDex === DEXES.UNISWAP) {
    buyTokenOut = await getUniswapBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      buyPool.feeTier
    );
  } else if (ctx.buyDex === DEXES.SUSHI) {
    buyTokenOut = await getSushiBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      buyPool
    );
  } else if (ctx.buyDex === DEXES.PANCAKESWAP) {
    buyTokenOut = await getPancakeBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      buyPool
    );
  } else {
    buyTokenOut = await getCamelotBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      buyPool.poolAddress
    );
  }

  const tokenAmount = ethers.formatUnits(buyTokenOut, token.decimals);
  let sellUsdcOut: bigint;

  if (ctx.sellDex === DEXES.UNISWAP) {
    sellUsdcOut = await getUniswapSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmount,
      sellPool.feeTier
    );
  } else if (ctx.sellDex === DEXES.SUSHI) {
    sellUsdcOut = await getSushiSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmount,
      sellPool
    );
  } else if (ctx.sellDex === DEXES.PANCAKESWAP) {
    sellUsdcOut = await getPancakeSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmount,
      sellPool
    );
  } else {
    sellUsdcOut = await getCamelotSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmount,
      sellPool.poolAddress
    );
  }

  return {
    buyTokenOut: Number(ethers.formatUnits(buyTokenOut, token.decimals)),
    sellUsdcOut: Number(ethers.formatUnits(sellUsdcOut, 6)),
  };
}

function failedSnapshot(delayMs: number, baselineNetProfit: number): QuoteSnapshot {
  return {
    delayMs,
    grossProfit: Number.NEGATIVE_INFINITY,
    gasAdjustedProfit: Number.NEGATIVE_INFINITY,
    profitDecayPercent: 100,
    stillProfitable: false,
    buyTokenOut: 0,
    sellUsdcOut: 0,
  };
}

export async function measureQuoteConsistency(
  provider: ethers.Provider,
  ctx: RouteQuoteContext,
  baselineNetProfit: number
): Promise<QuoteSnapshot[]> {
  const { buyDex, sellDex } = parseRoute(ctx.route);
  const fullCtx: RouteQuoteContext = { ...ctx, buyDex, sellDex };
  const gasEstimate = await estimateExecutionGas(provider, ctx.size);
  const flashFee = calculateFlashFee(ctx.size);
  const totalCosts = gasEstimate.gasCostUSD + flashFee;

  const snapshots: QuoteSnapshot[] = [];
  let elapsed = 0;

  for (const targetDelay of QUOTE_DELAY_MS) {
    const waitMs = targetDelay - elapsed;
    if (waitMs > 0) {
      await sleep(waitMs);
      elapsed = targetDelay;
    }

    try {
      const { buyTokenOut, sellUsdcOut } = await fetchRoundtripQuotes(provider, fullCtx);
      const grossProfit = Number((sellUsdcOut - ctx.size).toFixed(6));
      const gasAdjustedProfit = Number((grossProfit - totalCosts).toFixed(6));
      const profitDecayPercent =
        baselineNetProfit > 0
          ? Number((((baselineNetProfit - gasAdjustedProfit) / baselineNetProfit) * 100).toFixed(2))
          : gasAdjustedProfit <= 0
            ? 100
            : 0;

      snapshots.push({
        delayMs: targetDelay,
        grossProfit,
        gasAdjustedProfit,
        profitDecayPercent,
        stillProfitable: gasAdjustedProfit > 0,
        buyTokenOut,
        sellUsdcOut,
      });
    } catch {
      snapshots.push(failedSnapshot(targetDelay, baselineNetProfit));
    }
  }

  return snapshots;
}

export function buildRouteContext(
  token: string,
  route: string,
  size: number
): RouteQuoteContext {
  const { buyDex, sellDex } = parseRoute(route);
  return { token, route, size, buyDex, sellDex };
}
