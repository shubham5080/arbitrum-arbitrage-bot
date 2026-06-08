import { ethers } from "ethers";
import { DexId, DEXES } from "../config/dexes";
import { ADDRESSES } from "../config/addresses";
import { PoolMetadata } from "../types/poolMetadata";
import {
  getUniswapQuote,
  getUniswapSellQuote,
  getSushiBuyQuote,
  getSushiQuote,
  getSushiSellQuote,
} from "../quotes/quoteEngine";
import { quotePancakePool } from "../quotes/pancakeV3Quote";
import { getCamelotBuyQuote, getCamelotSellQuote } from "../quotes/camelotQuote";
import { findPoolForPairOnDex } from "./pairPoolDiscovery";
import { findAllUniswapPools } from "../discovery/uniswapPoolDiscovery";

const USDC = ADDRESSES.USDC.toLowerCase();

export interface QuoteLegOptions {
  /** Expected USD value of input — used to pick the most plausible Uniswap pool */
  inputUsd?: number;
  /** Cached USD price per token address (lowercase) */
  usdPrices?: Map<string, number>;
}

function estimateUsd(
  tokenAddress: string,
  amountHuman: number,
  usdPrices?: Map<string, number>
): number | null {
  const lc = tokenAddress.toLowerCase();
  if (lc === USDC) return amountHuman;
  const price = usdPrices?.get(lc);
  if (price === undefined) return null;
  return amountHuman * price;
}

async function quoteUniswapLeg(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountInStr: string,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  inputUsd?: number,
  usdPrices?: Map<string, number>
): Promise<{ amountOut: bigint; pool: PoolMetadata }> {
  const pools = await findAllUniswapPools(provider, tokenIn, tokenOut);
  if (pools.length === 0) {
    throw new Error(`No Uniswap pool for ${tokenIn.slice(0, 8)}→${tokenOut.slice(0, 8)}`);
  }

  const tokenOutLc = tokenOut.toLowerCase();
  const tokenInLc = tokenIn.toLowerCase();

  let best: { amountOut: bigint; pool: PoolMetadata; score: number } | null = null;

  for (const pool of pools) {
    let amountOut: bigint;
    try {
      if (tokenOutLc === USDC) {
        amountOut = await getUniswapSellQuote(
          provider,
          tokenIn,
          tokenInDecimals,
          amountInStr,
          pool.feeTier
        );
      } else if (tokenInLc === USDC) {
        amountOut = await getUniswapQuote(
          provider,
          USDC,
          tokenOut,
          amountInStr,
          tokenInDecimals,
          tokenOutDecimals,
          pool.feeTier
        );
      } else {
        amountOut = await getUniswapQuote(
          provider,
          tokenIn,
          tokenOut,
          amountInStr,
          tokenInDecimals,
          tokenOutDecimals,
          pool.feeTier
        );
      }
    } catch {
      continue;
    }

    if (inputUsd !== undefined && inputUsd > 0) {
      const outHuman = Number(ethers.formatUnits(amountOut, tokenOutDecimals));
      const outUsd = estimateUsd(tokenOut, outHuman, usdPrices);
      if (outUsd === null) continue;
      const ratio = outUsd / inputUsd;
      if (ratio < 0.5 || ratio > 1.05) continue;
      const score = Math.abs(1 - ratio);
      if (!best || score < best.score) {
        best = { amountOut, pool, score };
      }
    } else if (!best) {
      best = { amountOut, pool, score: 0 };
    }
  }

  if (!best) {
    const fallback = pools[0]!;
    let amountOut: bigint;
    if (tokenOutLc === USDC) {
      amountOut = await getUniswapSellQuote(
        provider,
        tokenIn,
        tokenInDecimals,
        amountInStr,
        fallback.feeTier
      );
    } else if (tokenInLc === USDC) {
      amountOut = await getUniswapQuote(
        provider,
        USDC,
        tokenOut,
        amountInStr,
        tokenInDecimals,
        tokenOutDecimals,
        fallback.feeTier
      );
    } else {
      amountOut = await getUniswapQuote(
        provider,
        tokenIn,
        tokenOut,
        amountInStr,
        tokenInDecimals,
        tokenOutDecimals,
        fallback.feeTier
      );
    }
    return { amountOut, pool: fallback };
  }

  return { amountOut: best.amountOut, pool: best.pool };
}

export async function quoteTriangleLeg(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountInHuman: number,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  dex: DexId,
  options?: QuoteLegOptions
): Promise<{ amountOut: bigint; pool: PoolMetadata | null }> {
  const amountInStr = amountInHuman.toFixed(Math.min(tokenInDecimals, 12));
  const tokenOutLc = tokenOut.toLowerCase();
  const tokenInLc = tokenIn.toLowerCase();

  if (dex === DEXES.UNISWAP) {
    const { amountOut, pool } = await quoteUniswapLeg(
      provider,
      tokenIn,
      tokenOut,
      amountInStr,
      tokenInDecimals,
      tokenOutDecimals,
      options?.inputUsd,
      options?.usdPrices
    );
    return { amountOut, pool };
  }

  const pool = await findPoolForPairOnDex(provider, tokenIn, tokenOut, dex);
  if (!pool) {
    throw new Error(`No pool for ${dex} ${tokenIn.slice(0, 8)}→${tokenOut.slice(0, 8)}`);
  }

  let amountOut: bigint;

  if (dex === DEXES.SUSHI) {
    if (tokenOutLc === USDC) {
      amountOut = await getSushiSellQuote(
        provider,
        tokenIn,
        tokenInDecimals,
        amountInStr,
        pool
      );
    } else if (tokenInLc === USDC) {
      amountOut = await getSushiBuyQuote(
        provider,
        tokenOut,
        tokenOutDecimals,
        amountInStr,
        pool
      );
    } else {
      amountOut = await getSushiQuote(
        provider,
        tokenIn,
        tokenOut,
        tokenInDecimals,
        tokenOutDecimals,
        amountInStr,
        pool
      );
    }
  } else if (dex === DEXES.PANCAKESWAP) {
    amountOut = await quotePancakePool(
      provider,
      pool,
      tokenIn,
      tokenOut,
      amountInStr,
      tokenInDecimals
    );
  } else if (dex === DEXES.CAMELOT) {
    if (tokenOutLc === USDC) {
      amountOut = await getCamelotSellQuote(
        provider,
        tokenIn,
        tokenInDecimals,
        amountInStr,
        pool.poolAddress
      );
    } else {
      amountOut = await getCamelotBuyQuote(
        provider,
        tokenOut,
        tokenOutDecimals,
        amountInStr,
        pool.poolAddress
      );
    }
  } else {
    throw new Error(`Unsupported DEX: ${dex}`);
  }

  return { amountOut, pool };
}

export function toHuman(amount: bigint, decimals: number): number {
  return Number(ethers.formatUnits(amount, decimals));
}
