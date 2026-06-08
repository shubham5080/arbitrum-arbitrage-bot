import { ethers } from "ethers";
import { TOKENS, TokenSymbol } from "../config/tokens";
import { DexId } from "../config/dexes";
import { ADDRESSES } from "../config/addresses";
import { TriangleCycle } from "./tokenGraph";
import { quoteTriangleLeg, toHuman } from "./triangleLegQuoter";
import { getUniswapSellQuote } from "../quotes/quoteEngine";
import { findBestUniswapPool } from "../discovery/uniswapPoolDiscovery";

export const TRADE_SIZES_USD = [1_000, 5_000, 10_000, 25_000] as const;
export const FLASH_FEE_RATE = 0.0009; // 0.09% per Day 32 spec
const GAS_USD_ESTIMATE = 0.05;
const MIN_LEG_USD_RATIO = 0.7;
const MAX_LEG_USD_RATIO = 1.02;

export interface TriangleSimulationInput {
  cycle: TriangleCycle;
  dexPath: [DexId, DexId, DexId];
  startAmountUsd: number;
}

export interface TriangleSimulationResult {
  cycle: TriangleCycle;
  dexPath: [DexId, DexId, DexId];
  dexPathLabel: string;
  startToken: TokenSymbol;
  startAmountUsd: number;
  startAmount: number;
  endAmount: number;
  endAmountUsd: number;
  grossProfit: number;
  gasCost: number;
  flashFee: number;
  netProfit: number;
  netProfitPct: number;
  executable: boolean;
  quoteSuccess: boolean;
  error?: string;
}

export async function getTokenUsdPrice(
  provider: ethers.Provider,
  symbol: TokenSymbol
): Promise<number> {
  if (symbol === "USDC") return 1;
  const token = TOKENS[symbol];
  const pool = await findBestUniswapPool(provider, token.address, ADDRESSES.USDC);
  if (!pool) {
    throw new Error(`No USDC pool for ${symbol}`);
  }
  const probe = symbol === "WBTC" ? "0.01" : "1";
  const quote = await getUniswapSellQuote(
    provider,
    token.address,
    token.decimals,
    probe,
    pool.feeTier
  );
  const outUsdc = Number(ethers.formatUnits(quote, 6));
  return symbol === "WBTC" ? outUsdc / 0.01 : outUsdc;
}

function usdToTokenAmount(usd: number, priceUsd: number, decimals: number): number {
  if (priceUsd <= 0) throw new Error("Invalid token price");
  const raw = usd / priceUsd;
  const factor = Math.pow(10, Math.min(decimals, 8));
  return Math.floor(raw * factor) / factor;
}

function assertLegUsdValue(
  legLabel: string,
  inputUsd: number,
  outputUsd: number
): void {
  const ratio = outputUsd / inputUsd;
  if (ratio < MIN_LEG_USD_RATIO || ratio > MAX_LEG_USD_RATIO) {
    throw new Error(
      `${legLabel} quote rejected: $${outputUsd.toFixed(0)} vs input $${inputUsd.toFixed(0)} (ratio ${ratio.toFixed(2)})`
    );
  }
}

export async function simulateTriangleRoute(
  provider: ethers.Provider,
  input: TriangleSimulationInput
): Promise<TriangleSimulationResult> {
  const { cycle, dexPath, startAmountUsd } = input;
  const startToken = TOKENS[cycle.start];
  const midToken = TOKENS[cycle.middle];
  const endToken = TOKENS[cycle.end];

  const base = {
    cycle,
    dexPath,
    dexPathLabel: dexPath.join(" → "),
    startToken: cycle.start,
    startAmountUsd,
    startAmount: 0,
    endAmount: 0,
    endAmountUsd: 0,
    grossProfit: 0,
    gasCost: GAS_USD_ESTIMATE,
    flashFee: startAmountUsd * FLASH_FEE_RATE,
    netProfit: 0,
    netProfitPct: 0,
    executable: false,
    quoteSuccess: false,
  };

  try {
    const usdPrices = new Map<string, number>();
    usdPrices.set(ADDRESSES.USDC.toLowerCase(), 1);

    const startPrice = await getTokenUsdPrice(provider, cycle.start);
    usdPrices.set(startToken.address.toLowerCase(), startPrice);

    const midPrice = await getTokenUsdPrice(provider, cycle.middle);
    usdPrices.set(midToken.address.toLowerCase(), midPrice);

    const endPrice = await getTokenUsdPrice(provider, cycle.end);
    usdPrices.set(endToken.address.toLowerCase(), endPrice);

    const priceOpts = { usdPrices };
    const startAmount = usdToTokenAmount(startAmountUsd, startPrice, startToken.decimals);
    if (startAmount <= 0) {
      throw new Error(`Start amount rounds to zero for $${startAmountUsd}`);
    }

    const leg1 = await quoteTriangleLeg(
      provider,
      startToken.address,
      midToken.address,
      startAmount,
      startToken.decimals,
      midToken.decimals,
      dexPath[0],
      { inputUsd: startAmountUsd, ...priceOpts }
    );
    const amt1 = toHuman(leg1.amountOut, midToken.decimals);
    const leg1Usd = amt1 * midPrice;
    assertLegUsdValue("Leg1", startAmountUsd, leg1Usd);

    const leg2 = await quoteTriangleLeg(
      provider,
      midToken.address,
      endToken.address,
      amt1,
      midToken.decimals,
      endToken.decimals,
      dexPath[1],
      { inputUsd: leg1Usd, ...priceOpts }
    );
    const amt2 = toHuman(leg2.amountOut, endToken.decimals);
    const leg2Usd = amt2 * endPrice;
    assertLegUsdValue("Leg2", leg1Usd, leg2Usd);

    const leg3 = await quoteTriangleLeg(
      provider,
      endToken.address,
      startToken.address,
      amt2,
      endToken.decimals,
      startToken.decimals,
      dexPath[2],
      { inputUsd: leg2Usd, ...priceOpts }
    );
    const endAmount = toHuman(leg3.amountOut, startToken.decimals);
    const endAmountUsd = endAmount * startPrice;
    assertLegUsdValue("Leg3", leg2Usd, endAmountUsd);

    const grossProfit = endAmountUsd - startAmountUsd;
    const netProfit = grossProfit - base.gasCost - base.flashFee;
    const netProfitPct = (netProfit / startAmountUsd) * 100;

    return {
      ...base,
      startAmount,
      endAmount,
      endAmountUsd,
      grossProfit: Number(grossProfit.toFixed(4)),
      netProfit: Number(netProfit.toFixed(4)),
      netProfitPct: Number(netProfitPct.toFixed(4)),
      executable: netProfit > 0,
      quoteSuccess: true,
    };
  } catch (e) {
    return {
      ...base,
      quoteSuccess: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
