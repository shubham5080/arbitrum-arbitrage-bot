import { ethers } from "ethers";
import dotenv from "dotenv";

import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
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
} from "../quotes/quoteEngine";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { isPoolTradable } from "../validation/poolValidator";
import { saveOpportunity } from "../database/database";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const sizes = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

async function getWethPriceInUsdc() {
  const wethToken = TOKENS.WETH;
  const wethUsdcQuote = await getUniswapSellQuote(
    provider,
    wethToken.address,
    wethToken.decimals,
    "1.0"
  );

  return Number(ethers.formatUnits(wethUsdcQuote, 6));
}

export async function scanMarket() {
  const opportunities: Opportunity[] = [];
  const gasCostEth = await estimateGasCost(provider);
  const wethPriceUsdc = await getWethPriceInUsdc();
  const gasCostUsdc = Number((gasCostEth * wethPriceUsdc).toFixed(6));

  for (const [symbol, token] of Object.entries(TOKENS)) {
    const uniswapPool = await getHighestLiquidityPoolForDex(
      provider,
      symbol,
      DEXES.UNISWAP
    );
    const sushiPool = await getHighestLiquidityPoolForDex(
      provider,
      symbol,
      DEXES.SUSHI
    );
    const camelotPool = await getHighestLiquidityPoolForDex(
      provider,
      symbol,
      DEXES.CAMELOT
    );

    const dexPools = [
      { dex: DEXES.UNISWAP, pool: uniswapPool },
      { dex: DEXES.SUSHI, pool: sushiPool },
      { dex: DEXES.CAMELOT, pool: camelotPool },
    ].filter(
      (entry): entry is { dex: string; pool: any } => entry.pool !== null
    );

    if (dexPools.length < 2) {
      continue;
    }

    const tradablePools = await Promise.all(
      dexPools.map(async (entry) => ({
        ...entry,
        tradable: await isPoolTradable(provider, entry.pool.address),
      }))
    );

    const activePools = tradablePools.filter((entry) => entry.tradable);
    if (activePools.length < 2) {
      continue;
    }

    const getBuyQuote = async (
      dex: string,
      pool: any,
      amountIn: number
    ) => {
      if (dex === DEXES.UNISWAP) {
        return getUniswapBuyQuote(
          provider,
          token.address,
          token.decimals,
          amountIn.toString(),
          pool.fee
        );
      }

      if (dex === DEXES.SUSHI) {
        return getSushiBuyQuote(
          provider,
          token.address,
          token.decimals,
          amountIn.toString(),
          pool.address
        );
      }

      return getCamelotBuyQuote(
        provider,
        token.address,
        token.decimals,
        amountIn.toString(),
        pool.address
      );
    };

    const getSellQuote = async (
      dex: string,
      pool: any,
      amountIn: string
    ) => {
      if (dex === DEXES.UNISWAP) {
        return getUniswapSellQuote(
          provider,
          token.address,
          token.decimals,
          amountIn,
          pool.fee
        );
      }

      if (dex === DEXES.SUSHI) {
        return getSushiSellQuote(
          provider,
          token.address,
          token.decimals,
          amountIn,
          pool.address
        );
      }

      return getCamelotSellQuote(
        provider,
        token.address,
        token.decimals,
        amountIn,
        pool.address
      );
    };

    for (const buy of activePools) {
      for (const sell of activePools) {
        if (buy.dex === sell.dex) {
          continue;
        }

        for (const size of sizes) {
          try {
            const buyTokenOut = await getBuyQuote(buy.dex, buy.pool, size);
            const sellFinalUsdc = await getSellQuote(
              sell.dex,
              sell.pool,
              ethers.formatUnits(buyTokenOut, token.decimals)
            );

            const finalUsdcNumber = Number(ethers.formatUnits(sellFinalUsdc, 6));
            const tokenAmount = Number(ethers.formatUnits(buyTokenOut, token.decimals));
            
            // Compute prices and spread
            const buyPrice = size / tokenAmount; // USDC per token (entry price)
            const sellPrice = finalUsdcNumber / tokenAmount; // USDC per token (exit price)
            const spreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
            
            // Compute slippage impact (costs as % of gross profit)
            const grossProfit = Number((finalUsdcNumber - size).toFixed(6));
            const totalCosts = gasCostUsdc + calculateFlashFee(size);
            const slippageImpact = grossProfit !== 0 ? (totalCosts / Math.abs(grossProfit)) * 100 : 0;
            
            const flashFee = Number(calculateFlashFee(size).toFixed(6));
            const netProfit = Number((grossProfit - gasCostUsdc - flashFee).toFixed(6));
            const score = Number((netProfit / size).toFixed(8));

            // Day 17: Profit Attribution (in USDC)
            const spreadContribution = Number(((sellPrice - buyPrice) * tokenAmount).toFixed(6));
            const gasContribution = Number((-gasCostUsdc).toFixed(6));
            const flashContribution = Number((-flashFee).toFixed(6));
            const executionContribution = Number((grossProfit - spreadContribution).toFixed(6));

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
              feeTier: buy.pool.fee,
              poolAddress: buy.pool.address,
            });
          } catch (error) {
            console.error(
              `${buy.dex} -> ${sell.dex} failed for ${symbol} ${size}:`,
              error
            );
          }
        }
      }
    }
  }

  return opportunities;
}

export async function scanAndSaveMarket() {
  const opportunities = await scanMarket();

  // Save all opportunities to database (including negative ones)
  for (const opportunity of opportunities) {
    saveOpportunity(opportunity);
  }

  return opportunities;
}
