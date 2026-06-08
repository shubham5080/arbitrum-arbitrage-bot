import { ethers } from "ethers";
import { ExecutionPlanResult } from "./executionTypes";
import { resolveDexRouter, UNISWAP_FEE_TIERS } from "../config/dexRouters";

export interface EncodedArbitrageRoute {
  tokenIn: string;
  tokenOut: string;
  buyDex: string;
  sellDex: string;
  amountIn: bigint;
  minProfit: bigint;
  buyFee: number;
  sellFee: number;
  minAmountAfterBuy: bigint;
  minAmountAfterSell: bigint;
}

export interface RouteEncodeOptions {
  tokenIn: string;
  tokenOut: string;
  tokenInDecimals?: number;
  network?: "arbitrumOne" | "arbitrumSepolia";
  slippageBps?: number;
  minProfitUsd?: number;
  buyFee?: number;
  sellFee?: number;
  expectedBuyOutput?: bigint;
  expectedSellOutput?: bigint;
}

function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function encodeRouteFromPlan(
  plan: ExecutionPlanResult,
  tokenIn: string,
  tokenOut: string,
  options: {
    tokenInDecimals: number;
    network?: "arbitrumOne" | "arbitrumSepolia";
    slippageBps?: number;
    expectedBuyOutput: bigint;
    expectedSellOutput: bigint;
    buyFee?: number;
    sellFee?: number;
  }
): EncodedArbitrageRoute {
  const slippageBps = options.slippageBps ?? 50;
  const network = options.network ?? "arbitrumOne";
  const amountIn = ethers.parseUnits(plan.tradeSize.toString(), options.tokenInDecimals);
  const minProfit = ethers.parseUnits(Math.max(plan.expectedNetProfit, 0).toFixed(options.tokenInDecimals), options.tokenInDecimals);

  return {
    tokenIn,
    tokenOut,
    buyDex: resolveDexRouter(plan.buyDex, network),
    sellDex: resolveDexRouter(plan.sellDex, network),
    amountIn,
    minProfit: minProfit > 0n ? minProfit : 1n,
    buyFee: options.buyFee ?? UNISWAP_FEE_TIERS.MEDIUM,
    sellFee: options.sellFee ?? UNISWAP_FEE_TIERS.MEDIUM,
    minAmountAfterBuy: applySlippage(options.expectedBuyOutput, slippageBps),
    minAmountAfterSell: applySlippage(options.expectedSellOutput, slippageBps),
  };
}

export function encodeRoute(options: RouteEncodeOptions & { amountIn: bigint }): EncodedArbitrageRoute {
  const network = options.network ?? "arbitrumSepolia";
  const slippageBps = options.slippageBps ?? 50;
  const buyFee = options.buyFee ?? UNISWAP_FEE_TIERS.MEDIUM;
  const sellFee = options.sellFee ?? UNISWAP_FEE_TIERS.MEDIUM;

  const minProfit =
    options.minProfitUsd !== undefined
      ? ethers.parseUnits(options.minProfitUsd.toString(), options.tokenInDecimals ?? 6)
      : 1n;

  const minAmountAfterBuy = options.expectedBuyOutput
    ? applySlippage(options.expectedBuyOutput, slippageBps)
    : 1n;
  const minAmountAfterSell = options.expectedSellOutput
    ? applySlippage(options.expectedSellOutput, slippageBps)
    : 1n;

  return {
    tokenIn: options.tokenIn,
    tokenOut: options.tokenOut,
    buyDex: resolveDexRouter("UNISWAP", network),
    sellDex: resolveDexRouter("UNISWAP", network),
    amountIn: options.amountIn,
    minProfit,
    buyFee,
    sellFee,
    minAmountAfterBuy,
    minAmountAfterSell,
  };
}

export function toContractRoute(route: EncodedArbitrageRoute) {
  return {
    tokenIn: route.tokenIn,
    tokenOut: route.tokenOut,
    buyDex: route.buyDex,
    sellDex: route.sellDex,
    amountIn: route.amountIn,
    minProfit: route.minProfit,
    buyFee: route.buyFee,
    sellFee: route.sellFee,
    minAmountAfterBuy: route.minAmountAfterBuy,
    minAmountAfterSell: route.minAmountAfterSell,
  };
}
