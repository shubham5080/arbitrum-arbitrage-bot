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
import { estimateExecutionGas } from "./gasEstimator";
import { ExecutionPlanRequest, RouteValidationResult } from "./executionTypes";
import { PoolMetadata } from "../types/poolMetadata";

const MIN_LIQUIDITY = 200000n;
const MIN_SPREAD_PERCENT = 0.05;

export async function validateRoute(
  provider: ethers.Provider,
  request: ExecutionPlanRequest
): Promise<RouteValidationResult> {
  const tokenData = (TOKENS as any)[request.token];
  if (!tokenData) {
    return invalidRoute("Unknown token symbol");
  }

  const buyPool = await getHighestLiquidityPoolForDex(provider, request.token, request.buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, request.token, request.sellDex);

  if (!buyPool || !sellPool) {
    return invalidRoute("One or more pools are unavailable");
  }

  const buyTokenAmount = await getBuyTokenAmount(provider, request, buyPool, tokenData);
  const sellUsdcOut = await getSellUsdcAmount(provider, request, sellPool, tokenData, buyTokenAmount);

  const currentGrossProfit = sellUsdcOut - request.tradeSize;
  const gasEstimate = await estimateExecutionGas(provider, request.tradeSize);
  const currentNetProfit = Number((currentGrossProfit - gasEstimate.gasCostUSD - calculateFlashFee(request.tradeSize)).toFixed(6));
  const currentSpreadPercent = computeSpreadPercent(request.tradeSize, buyTokenAmount, sellUsdcOut);

  const poolExists = true;
  const liquiditySufficient = buyPool.liquidity >= MIN_LIQUIDITY && sellPool.liquidity >= MIN_LIQUIDITY;
  const spreadValid = currentSpreadPercent >= MIN_SPREAD_PERCENT;
  const profitStillPositive = currentNetProfit > 0;

  if (!liquiditySufficient) {
    return {
      valid: false,
      reason: "Liquidity has fallen below minimum threshold",
      poolExists,
      liquiditySufficient,
      spreadValid,
      profitStillPositive,
      currentNetProfit,
      currentSpreadPercent,
    };
  }

  if (!spreadValid) {
    return {
      valid: false,
      reason: "Spread is too thin for safe execution",
      poolExists,
      liquiditySufficient,
      spreadValid,
      profitStillPositive,
      currentNetProfit,
      currentSpreadPercent,
    };
  }

  if (!profitStillPositive) {
    return {
      valid: false,
      reason: "Route no longer produces positive net profit",
      poolExists,
      liquiditySufficient,
      spreadValid,
      profitStillPositive,
      currentNetProfit,
      currentSpreadPercent,
    };
  }

  return {
    valid: true,
    reason: "Route remains executable",
    poolExists,
    liquiditySufficient,
    spreadValid,
    profitStillPositive,
    currentNetProfit,
    currentSpreadPercent,
  };
}

function invalidRoute(reason: string): RouteValidationResult {
  return {
    valid: false,
    reason,
    poolExists: false,
    liquiditySufficient: false,
    spreadValid: false,
    profitStillPositive: false,
    currentNetProfit: 0,
    currentSpreadPercent: 0,
  };
}

async function getBuyTokenAmount(
  provider: ethers.Provider,
  request: ExecutionPlanRequest,
  pool: PoolMetadata,
  tokenData: { address: string; decimals: number }
) {
  if (request.buyDex === "UNISWAP") {
    const amount = await getUniswapBuyQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      request.tradeSize.toString(),
      pool.feeTier
    );
    return Number(ethers.formatUnits(amount, tokenData.decimals));
  }

  if (request.buyDex === "SUSHI") {
    const amount = await getSushiBuyQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      request.tradeSize.toString(),
      pool
    );
    return Number(ethers.formatUnits(amount, tokenData.decimals));
  }

  if (request.buyDex === "CAMELOT") {
    const amount = await getCamelotBuyQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      request.tradeSize.toString(),
      pool.poolAddress
    );
    return Number(ethers.formatUnits(amount, tokenData.decimals));
  }

  if (request.buyDex === "PANCAKESWAP") {
    const amount = await getPancakeBuyQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      request.tradeSize.toString(),
      pool
    );
    return Number(ethers.formatUnits(amount, tokenData.decimals));
  }

  throw new Error(`Unsupported buy DEX: ${request.buyDex}`);
}

async function getSellUsdcAmount(
  provider: ethers.Provider,
  request: ExecutionPlanRequest,
  pool: PoolMetadata,
  tokenData: { address: string; decimals: number },
  tokenAmount: number
) {
  const tokenAmountString = tokenAmount.toString();

  if (request.sellDex === "UNISWAP") {
    const quote = await getUniswapSellQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      tokenAmountString,
      pool.feeTier
    );
    return Number(ethers.formatUnits(quote, 6));
  }

  if (request.sellDex === "SUSHI") {
    const quote = await getSushiSellQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      tokenAmountString,
      pool
    );
    return Number(ethers.formatUnits(quote, 6));
  }

  if (request.sellDex === "CAMELOT") {
    const quote = await getCamelotSellQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      tokenAmountString,
      pool.poolAddress
    );
    return Number(ethers.formatUnits(quote, 6));
  }

  if (request.sellDex === "PANCAKESWAP") {
    const quote = await getPancakeSellQuote(
      provider,
      tokenData.address,
      tokenData.decimals,
      tokenAmountString,
      pool
    );
    return Number(ethers.formatUnits(quote, 6));
  }

  throw new Error(`Unsupported sell DEX: ${request.sellDex}`);
}

function computeSpreadPercent(
  tradeSize: number,
  tokenAmount: number,
  usdcOut: number
) {
  if (tokenAmount <= 0) {
    return 0;
  }
  const buyPrice = tradeSize / tokenAmount;
  const sellPrice = usdcOut / tokenAmount;
  return buyPrice <= 0 ? 0 : ((sellPrice - buyPrice) / buyPrice) * 100;
}
