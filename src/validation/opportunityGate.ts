import { ethers } from "ethers";
import dotenv from "dotenv";
import { Opportunity } from "../types/opportunity";
import { calculateFlashFee } from "../utils/feeCalculator";
import { estimateGasCost } from "../utils/gasEstimator";
import { TOKENS } from "../config/tokens";
import { DEXES } from "../config/dexes";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
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
import { SETTINGS } from "../config/settings";

dotenv.config();

export interface RequoteValidationResult {
  accepted: boolean;
  originalNetProfit: number;
  requotedNetProfit: number;
  profitDiff: number;
  profitDiffPercent: number;
  reason: string;
}

export const REQUOTE_CONFIG = {
  enabled: process.env.REQUOTE_VALIDATION !== "false",
  maxProfitDiffUsd: Number(process.env.REQUOTE_MAX_DIFF_USD ?? "0.50"),
  maxProfitDiffPercent: Number(process.env.REQUOTE_MAX_DIFF_PCT ?? "25"),
  requireRequoteProfitable: true,
};

async function getWethPriceUsdc(provider: ethers.Provider) {
  const weth = TOKENS.WETH!;
  const quote = await getUniswapSellQuote(provider, weth.address, weth.decimals, "1.0");
  return Number(ethers.formatUnits(quote, 6));
}

async function requoteOpportunity(
  provider: ethers.Provider,
  opportunity: Opportunity
): Promise<number> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[opportunity.token];
  if (!token) throw new Error(`Unknown token ${opportunity.token}`);

  const [buyDex, sellDex] = opportunity.route.split("->").map((s) => s.trim());
  if (!buyDex || !sellDex) throw new Error(`Invalid route: ${opportunity.route}`);
  const buyPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, sellDex);
  if (!buyPool || !sellPool) throw new Error("Pool unavailable for requote");

  let buyOut: bigint;
  if (buyDex === DEXES.UNISWAP) {
    buyOut = await getUniswapBuyQuote(
      provider,
      token.address,
      token.decimals,
      opportunity.size.toString(),
      buyPool.feeTier
    );
  } else if (buyDex === DEXES.SUSHI) {
    buyOut = await getSushiBuyQuote(
      provider,
      token.address,
      token.decimals,
      opportunity.size.toString(),
      buyPool
    );
  } else if (buyDex === DEXES.PANCAKESWAP) {
    buyOut = await getPancakeBuyQuote(
      provider,
      token.address,
      token.decimals,
      opportunity.size.toString(),
      buyPool
    );
  } else {
    buyOut = await getCamelotBuyQuote(
      provider,
      token.address,
      token.decimals,
      opportunity.size.toString(),
      buyPool.poolAddress
    );
  }

  const tokenAmt = ethers.formatUnits(buyOut, token.decimals);
  let sellOut: bigint;
  if (sellDex === DEXES.UNISWAP) {
    sellOut = await getUniswapSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmt,
      sellPool.feeTier
    );
  } else if (sellDex === DEXES.SUSHI) {
    sellOut = await getSushiSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmt,
      sellPool
    );
  } else if (sellDex === DEXES.PANCAKESWAP) {
    sellOut = await getPancakeSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmt,
      sellPool
    );
  } else {
    sellOut = await getCamelotSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmt,
      sellPool.poolAddress
    );
  }

  const gasCostEth = await estimateGasCost(provider);
  const wethPrice = await getWethPriceUsdc(provider);
  const gasCostUsdc = Number((gasCostEth * wethPrice).toFixed(6));
  const flashFee = calculateFlashFee(opportunity.size);
  const gross = Number(ethers.formatUnits(sellOut, 6)) - opportunity.size;
  return Number((gross - gasCostUsdc - flashFee).toFixed(6));
}

export async function validateOpportunityBeforeSave(
  provider: ethers.Provider,
  opportunity: Opportunity
): Promise<RequoteValidationResult> {
  if (!REQUOTE_CONFIG.enabled || opportunity.netProfit <= 0) {
    return {
      accepted: true,
      originalNetProfit: opportunity.netProfit,
      requotedNetProfit: opportunity.netProfit,
      profitDiff: 0,
      profitDiffPercent: 0,
      reason: opportunity.netProfit <= 0 ? "non-profitable always stored" : "validation disabled",
    };
  }

  try {
    const requotedNetProfit = await requoteOpportunity(provider, opportunity);
    const profitDiff = Number((opportunity.netProfit - requotedNetProfit).toFixed(6));
    const profitDiffPercent =
      opportunity.netProfit !== 0
        ? Number(((Math.abs(profitDiff) / opportunity.netProfit) * 100).toFixed(2))
        : 100;

    if (REQUOTE_CONFIG.requireRequoteProfitable && requotedNetProfit <= 0) {
      return {
        accepted: false,
        originalNetProfit: opportunity.netProfit,
        requotedNetProfit,
        profitDiff,
        profitDiffPercent,
        reason: "immediate re-quote unprofitable",
      };
    }

    if (Math.abs(profitDiff) > REQUOTE_CONFIG.maxProfitDiffUsd) {
      return {
        accepted: false,
        originalNetProfit: opportunity.netProfit,
        requotedNetProfit,
        profitDiff,
        profitDiffPercent,
        reason: `profit diff $${Math.abs(profitDiff).toFixed(2)} exceeds $${REQUOTE_CONFIG.maxProfitDiffUsd}`,
      };
    }

    if (profitDiffPercent > REQUOTE_CONFIG.maxProfitDiffPercent) {
      return {
        accepted: false,
        originalNetProfit: opportunity.netProfit,
        requotedNetProfit,
        profitDiff,
        profitDiffPercent,
        reason: `profit diff ${profitDiffPercent}% exceeds ${REQUOTE_CONFIG.maxProfitDiffPercent}%`,
      };
    }

    if (requotedNetProfit < SETTINGS.MIN_NET_PROFIT) {
      return {
        accepted: false,
        originalNetProfit: opportunity.netProfit,
        requotedNetProfit,
        profitDiff,
        profitDiffPercent,
        reason: `requoted profit $${requotedNetProfit} below MIN_NET_PROFIT $${SETTINGS.MIN_NET_PROFIT}`,
      };
    }

    return {
      accepted: true,
      originalNetProfit: opportunity.netProfit,
      requotedNetProfit,
      profitDiff,
      profitDiffPercent,
      reason: "passed requote validation",
    };
  } catch (error) {
    return {
      accepted: false,
      originalNetProfit: opportunity.netProfit,
      requotedNetProfit: Number.NEGATIVE_INFINITY,
      profitDiff: opportunity.netProfit,
      profitDiffPercent: 100,
      reason: error instanceof Error ? error.message : "requote failed",
    };
  }
}
