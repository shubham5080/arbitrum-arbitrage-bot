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
import { calculateFlashFee } from "../utils/feeCalculator";
import { estimateGasCost } from "../utils/gasEstimator";
import { StoredOpportunity } from "../database/database";
import { validateProfit } from "./profitValidator";
import { ReplayResult } from "./types";

const DELAY_SLIPPAGE_RATE = 0.0001; // 0.01% slippage per second of execution delay

async function getWethPriceInUsdc(provider: ethers.Provider) {
  const wethToken = TOKENS.WETH!;
  const wethUsdcQuote = await getUniswapSellQuote(
    provider,
    wethToken.address,
    wethToken.decimals,
    "1.0"
  );

  return Number(ethers.formatUnits(wethUsdcQuote, 6));
}

async function estimateGasCostUsdc(provider: ethers.Provider) {
  const gasCostEth = await estimateGasCost(provider);
  const wethPriceUsdc = await getWethPriceInUsdc(provider);
  return Number((gasCostEth * wethPriceUsdc).toFixed(6));
}

function parseRoute(route: string) {
  const parts = route.split("->").map((part) => part.trim());
  return {
    buyDex: parts[0] ?? "",
    sellDex: parts[1] ?? "",
  };
}

function applyDelaySlippage(size: number, delaySeconds: number) {
  return size * delaySeconds * DELAY_SLIPPAGE_RATE;
}

export async function simulateOpportunity(
  provider: ethers.Provider,
  opportunity: StoredOpportunity,
  delaySeconds: number
): Promise<ReplayResult> {
  const { buyDex, sellDex } = parseRoute(opportunity.route);
  const tokenSymbol = opportunity.token;
  const token = (TOKENS as any)[tokenSymbol];

  const buyPool = await getHighestLiquidityPoolForDex(
    provider,
    tokenSymbol,
    buyDex
  );
  const sellPool = await getHighestLiquidityPoolForDex(
    provider,
    tokenSymbol,
    sellDex
  );

  const originalProfit = opportunity.net_profit;
  const size = opportunity.size;
  const amountIn = size.toString();

  let currentTokenAmount = 0;
  let currentUsdcOut = 0;
  let buyLiquidity = buyPool?.liquidity ?? null;
  let sellLiquidity = sellPool?.liquidity ?? null;

  if (!buyPool || !sellPool) {
    return {
      opportunityKey: `${tokenSymbol}|${opportunity.route}|${size}`,
      ...(opportunity.id !== undefined ? { opportunityId: opportunity.id } : {}),
      token: tokenSymbol,
      route: opportunity.route,
      size,
      delaySeconds,
      originalProfit,
      currentProfit: Number.NEGATIVE_INFINITY,
      profitDifference: Number.NEGATIVE_INFINITY,
      profitChangePct: Number.NEGATIVE_INFINITY,
      classification: "DEAD",
      reason: "pool unavailable",
      executable: false,
      buyLiquidity: buyPool?.liquidity?.toString() ?? null,
      sellLiquidity: sellPool?.liquidity?.toString() ?? null,
      isStillProfitable: false,
      validation: validateProfit({
        currentProfit: Number.NEGATIVE_INFINITY,
        size,
        buyLiquidity: buyLiquidity,
        sellLiquidity: sellLiquidity,
      }),
    };
  }

  try {
    if (buyDex === "UNISWAP") {
      currentTokenAmount = Number(
        ethers.formatUnits(
          await getUniswapBuyQuote(
            provider,
            token.address,
            token.decimals,
            amountIn,
            buyPool.feeTier
          ),
          token.decimals
        )
      );
    } else if (buyDex === "SUSHI") {
      currentTokenAmount = Number(
        ethers.formatUnits(
          await getSushiBuyQuote(
            provider,
            token.address,
            token.decimals,
            amountIn,
            buyPool
          ),
          token.decimals
        )
      );
    } else if (buyDex === "CAMELOT") {
      currentTokenAmount = Number(
        ethers.formatUnits(
          await getCamelotBuyQuote(
            provider,
            token.address,
            token.decimals,
            amountIn,
            buyPool.poolAddress
          ),
          token.decimals
        )
      );
    } else if (buyDex === "PANCAKESWAP") {
      currentTokenAmount = Number(
        ethers.formatUnits(
          await getPancakeBuyQuote(
            provider,
            token.address,
            token.decimals,
            amountIn,
            buyPool
          ),
          token.decimals
        )
      );
    } else {
      throw new Error(`Unsupported buy DEX: ${buyDex}`);
    }

    const tokenAmountString = currentTokenAmount.toString();

    if (sellDex === "UNISWAP") {
      currentUsdcOut = Number(
        ethers.formatUnits(
          await getUniswapSellQuote(
            provider,
            token.address,
            token.decimals,
            tokenAmountString,
            sellPool.feeTier
          ),
          6
        )
      );
    } else if (sellDex === "SUSHI") {
      currentUsdcOut = Number(
        ethers.formatUnits(
          await getSushiSellQuote(
            provider,
            token.address,
            token.decimals,
            tokenAmountString,
            sellPool
          ),
          6
        )
      );
    } else if (sellDex === "CAMELOT") {
      currentUsdcOut = Number(
        ethers.formatUnits(
          await getCamelotSellQuote(
            provider,
            token.address,
            token.decimals,
            tokenAmountString,
            sellPool.poolAddress
          ),
          6
        )
      );
    } else if (sellDex === "PANCAKESWAP") {
      currentUsdcOut = Number(
        ethers.formatUnits(
          await getPancakeSellQuote(
            provider,
            token.address,
            token.decimals,
            tokenAmountString,
            sellPool
          ),
          6
        )
      );
    } else {
      throw new Error(`Unsupported sell DEX: ${sellDex}`);
    }
  } catch (error) {
    return {
      opportunityKey: `${tokenSymbol}|${opportunity.route}|${size}`,
      ...(opportunity.id !== undefined ? { opportunityId: opportunity.id } : {}),
      token: tokenSymbol,
      route: opportunity.route,
      size,
      delaySeconds,
      originalProfit,
      currentProfit: Number.NEGATIVE_INFINITY,
      profitDifference: Number.NEGATIVE_INFINITY,
      profitChangePct: Number.NEGATIVE_INFINITY,
      classification: "DEAD",
      reason: `quote failed: ${String(error)}`,
      executable: false,
      buyLiquidity: buyPool.liquidity.toString(),
      sellLiquidity: sellPool.liquidity.toString(),
      isStillProfitable: false,
      validation: validateProfit({
        currentProfit: Number.NEGATIVE_INFINITY,
        size,
        buyLiquidity,
        sellLiquidity,
      }),
    };
  }

  const currentGrossProfit = currentUsdcOut - size;
  const delaySlippageCost = applyDelaySlippage(size, delaySeconds);
  const gasCostUsdc = await estimateGasCostUsdc(provider);
  const flashFee = calculateFlashFee(size);
  const currentProfit = Number(
    (currentGrossProfit - gasCostUsdc - flashFee - delaySlippageCost).toFixed(6)
  );

  const profitDifference = Number((currentProfit - originalProfit).toFixed(6));
  const profitChangePct =
    originalProfit !== 0
      ? Number(((profitDifference / Math.abs(originalProfit)) * 100).toFixed(2))
      : 0;

  const validation = validateProfit({
    currentProfit,
    size,
    buyLiquidity,
    sellLiquidity,
  });

  return {
    opportunityKey: `${tokenSymbol}|${opportunity.route}|${size}`,
    ...(opportunity.id !== undefined ? { opportunityId: opportunity.id } : {}),
    token: tokenSymbol,
    route: opportunity.route,
    size,
    delaySeconds,
    originalProfit,
    currentProfit,
    profitDifference,
    profitChangePct,
    classification: validation.classification,
    reason: validation.reason,
    executable: validation.classification === "EXECUTABLE",
    buyLiquidity: buyPool.liquidity.toString(),
    sellLiquidity: sellPool.liquidity.toString(),
    isStillProfitable: currentProfit > 0,
    validation,
  };
}
