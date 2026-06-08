import { ethers } from "ethers";
import dotenv from "dotenv";

import { DEXES, DexId, SCAN_DEXES } from "../config/dexes";
import { TOKENS, ARBITRAGE_SYMBOLS } from "../config/tokens";
import { Opportunity } from "../types/opportunity";
import { estimateGasCost } from "../utils/gasEstimator";
import { calculateFlashFee } from "../utils/feeCalculator";
import {
  getSushiBuyQuote,
  getSushiSellQuote,
  getUniswapBuyQuote,
  getUniswapSellQuote,
  getCamelotBuyQuote,
  getCamelotSellQuote,
  getPancakeBuyQuote,
  getPancakeSellQuote,
} from "../quotes/quoteEngine";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { isPoolTradable } from "../validation/poolValidator";
import { PoolMetadata } from "../types/poolMetadata";
import { saveOpportunity } from "../database/database";
import { validateOpportunityBeforeSave } from "../validation/opportunityGate";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const sizes = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

export interface ScanStats {
  tokensConsidered: number;
  tokensSkippedInsufficientDexes: number;
  tokensScanned: number;
  dexPairsPerToken: Record<string, number>;
  routesEvaluated: number;
  routesSkippedSameDex: number;
  routesFailed: number;
  opportunitiesFound: number;
  profitableFound: number;
  validatedSaved: number;
  requoteRejected: number;
}

export const lastScanStats: ScanStats = {
  tokensConsidered: 0,
  tokensSkippedInsufficientDexes: 0,
  tokensScanned: 0,
  dexPairsPerToken: {},
  routesEvaluated: 0,
  routesSkippedSameDex: 0,
  routesFailed: 0,
  opportunitiesFound: 0,
  profitableFound: 0,
  validatedSaved: 0,
  requoteRejected: 0,
};

function resetScanStats() {
  lastScanStats.tokensConsidered = 0;
  lastScanStats.tokensSkippedInsufficientDexes = 0;
  lastScanStats.tokensScanned = 0;
  lastScanStats.dexPairsPerToken = {};
  lastScanStats.routesEvaluated = 0;
  lastScanStats.routesSkippedSameDex = 0;
  lastScanStats.routesFailed = 0;
  lastScanStats.opportunitiesFound = 0;
  lastScanStats.profitableFound = 0;
  lastScanStats.validatedSaved = 0;
  lastScanStats.requoteRejected = 0;
}

async function getWethPriceInUsdc() {
  const wethToken = TOKENS.WETH!;
  const wethUsdcQuote = await getUniswapSellQuote(
    provider,
    wethToken.address,
    wethToken.decimals,
    "1.0"
  );
  return Number(ethers.formatUnits(wethUsdcQuote, 6));
}

async function getBuyQuote(
  dex: string,
  pool: PoolMetadata,
  token: { address: string; decimals: number },
  amountIn: number
) {
  if (dex === DEXES.UNISWAP) {
    return getUniswapBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn.toString(),
      pool.feeTier
    );
  }
  if (dex === DEXES.SUSHI) {
    return getSushiBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn.toString(),
      pool
    );
  }
  if (dex === DEXES.PANCAKESWAP) {
    return getPancakeBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountIn.toString(),
      pool
    );
  }
  return getCamelotBuyQuote(
    provider,
    token.address,
    token.decimals,
    amountIn.toString(),
    pool.poolAddress
  );
}

async function getSellQuote(
  dex: string,
  pool: PoolMetadata,
  token: { address: string; decimals: number },
  amountIn: string
) {
  if (dex === DEXES.UNISWAP) {
    return getUniswapSellQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      pool.feeTier
    );
  }
  if (dex === DEXES.SUSHI) {
    return getSushiSellQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      pool
    );
  }
  if (dex === DEXES.PANCAKESWAP) {
    return getPancakeSellQuote(
      provider,
      token.address,
      token.decimals,
      amountIn,
      pool
    );
  }
  return getCamelotSellQuote(
    provider,
    token.address,
    token.decimals,
    amountIn,
    pool.poolAddress
  );
}

export async function scanMarket(): Promise<Opportunity[]> {
  resetScanStats();
  const opportunities: Opportunity[] = [];
  const gasCostEth = await estimateGasCost(provider);
  const wethPriceUsdc = await getWethPriceInUsdc();
  const gasCostUsdc = Number((gasCostEth * wethPriceUsdc).toFixed(6));

  for (const symbol of ARBITRAGE_SYMBOLS) {
    lastScanStats.tokensConsidered += 1;
    const token = TOKENS[symbol];
    if (!token) continue;

    const poolEntries = await Promise.all(
      SCAN_DEXES.map(async (dex) => ({
        dex,
        pool: await getHighestLiquidityPoolForDex(provider, symbol, dex),
      }))
    );

    const dexPools = poolEntries.filter(
      (entry): entry is { dex: DexId; pool: PoolMetadata } => entry.pool !== null
    );

    if (dexPools.length < 2) {
      lastScanStats.tokensSkippedInsufficientDexes += 1;
      continue;
    }

    const tradablePools = await Promise.all(
      dexPools.map(async (entry) => ({
        ...entry,
        tradable: await isPoolTradable(provider, entry.pool.poolAddress),
      }))
    );

    const activePools = tradablePools.filter((entry) => entry.tradable);
    if (activePools.length < 2) {
      lastScanStats.tokensSkippedInsufficientDexes += 1;
      continue;
    }

    lastScanStats.tokensScanned += 1;
    const directedPairs = activePools.length * (activePools.length - 1);
    lastScanStats.dexPairsPerToken[symbol] = directedPairs;

    for (const buy of activePools) {
      for (const sell of activePools) {
        if (buy.dex === sell.dex) {
          lastScanStats.routesSkippedSameDex += sizes.length;
          continue;
        }

        for (const size of sizes) {
          lastScanStats.routesEvaluated += 1;
          try {
            const buyTokenOut = await getBuyQuote(buy.dex, buy.pool, token, size);
            const sellFinalUsdc = await getSellQuote(
              sell.dex,
              sell.pool,
              token,
              ethers.formatUnits(buyTokenOut, token.decimals)
            );

            const finalUsdcNumber = Number(ethers.formatUnits(sellFinalUsdc, 6));
            const tokenAmount = Number(ethers.formatUnits(buyTokenOut, token.decimals));

            const buyPrice = size / tokenAmount;
            const sellPrice = finalUsdcNumber / tokenAmount;
            const spreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

            const grossProfit = Number((finalUsdcNumber - size).toFixed(6));
            const totalCosts = gasCostUsdc + calculateFlashFee(size);
            const slippageImpact =
              grossProfit !== 0 ? (totalCosts / Math.abs(grossProfit)) * 100 : 0;

            const flashFee = Number(calculateFlashFee(size).toFixed(6));
            const netProfit = Number((grossProfit - gasCostUsdc - flashFee).toFixed(6));
            const score = Number((netProfit / size).toFixed(8));

            const spreadContribution = Number(
              ((sellPrice - buyPrice) * tokenAmount).toFixed(6)
            );
            const gasContribution = Number((-gasCostUsdc).toFixed(6));
            const flashContribution = Number((-flashFee).toFixed(6));
            const executionContribution = Number(
              (grossProfit - spreadContribution).toFixed(6)
            );

            opportunities.push({
              token: symbol,
              route: `${buy.dex} -> ${sell.dex}`,
              size,
              grossProfit,
              gasCost: gasCostUsdc,
              flashFee,
              netProfit,
              score,
              buyPrice: Number(buyPrice.toFixed(6)),
              sellPrice: Number(sellPrice.toFixed(6)),
              spreadPercent: Number(spreadPercent.toFixed(4)),
              slippageImpact: Number(slippageImpact.toFixed(2)),
              spreadContribution,
              gasContribution,
              flashContribution,
              executionContribution,
              liquidity: buy.pool.liquidity.toString(),
              feeTier: buy.pool.feeTier,
              poolAddress: buy.pool.poolAddress,
              poolType: buy.pool.poolType,
              sellPoolAddress: sell.pool.poolAddress,
              sellPoolType: sell.pool.poolType,
              sellFeeTier: sell.pool.feeTier,
            });
          } catch (error) {
            lastScanStats.routesFailed += 1;
            console.error(
              `${buy.dex} -> ${sell.dex} failed for ${symbol} ${size}:`,
              error
            );
          }
        }
      }
    }
  }

  lastScanStats.opportunitiesFound = opportunities.length;
  lastScanStats.profitableFound = opportunities.filter((o) => o.netProfit > 0).length;

  return opportunities;
}

export async function scanAndSaveMarket() {
  const opportunities = await scanMarket();

  for (const opportunity of opportunities) {
    if (opportunity.netProfit > 0) {
      const validation = await validateOpportunityBeforeSave(provider, opportunity);
      if (!validation.accepted) {
        lastScanStats.requoteRejected += 1;
        continue;
      }
      lastScanStats.validatedSaved += 1;
    }
    saveOpportunity(opportunity);
  }

  if (lastScanStats.requoteRejected > 0) {
    console.log(
      `Requote gate rejected ${lastScanStats.requoteRejected} false-positive opportunities`
    );
  }

  console.log(
    `Scan stats: evaluated=${lastScanStats.routesEvaluated} ` +
      `skipped=${lastScanStats.routesSkippedSameDex} ` +
      `failed=${lastScanStats.routesFailed} ` +
      `profitable=${lastScanStats.profitableFound} ` +
      `saved=${lastScanStats.validatedSaved}`
  );

  return opportunities;
}
