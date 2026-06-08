/**
 * Day 18: Triangle Simulator
 * 
 * Simulates a triangular arbitrage route across three tokens and three DEXs.
 * 
 * Example:
 *   1000 USDC -> ARB (Uniswap)
 *   ARB -> WETH (Sushi)
 *   WETH -> USDC (Camelot)
 *   
 * Outputs: Final USDC amount and profit %
 */

import { ethers } from "ethers";
import { TriangleRoute, TriangleSimulationResult, RouteLegResult } from "./types";
import {
  getUniswapBuyQuote,
  getUniswapSellQuote,
  getUniswapQuote,
  getSushiQuote,
  getSushiBuyQuote,
  getSushiSellQuote,
  getCamelotBuyQuote,
  getCamelotSellQuote,
} from "../../quotes/quoteEngine";
import { ADDRESSES } from "../../config/addresses";
import { findBestUniswapPool } from "../../discovery/uniswapPoolDiscovery";
import { enrichPoolMetadataFromAddress } from "../../discovery/poolMetadataHelpers";
import { getPoolLiquidity } from "../../validation/poolValidator";
import { PoolMetadata } from "../../types/poolMetadata";
import { RISK } from "../../config/risk";
import { logRejectedRoute } from "../../utils/rejectionLogger";

const UNISWAP_FACTORY_ABI = [
  "function getPool(address,address,uint24) external view returns (address)",
];

export class TriangleSimulator {
  constructor(private provider: ethers.Provider) {}

  /**
   * Simulate one leg of the triangle route
   * Uses the actual quote functions from the codebase
   */
  async simulateLeg(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    amountInDecimals: number,
    amountOutDecimals: number,
    dex: string,
    poolAddress?: string
  ): Promise<RouteLegResult> {
    const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
    const amountInString = amountIn.toFixed(amountInDecimals);

    console.debug("[SIMULATOR] simulateLeg requestedAmountIn:", {
      tokenIn,
      tokenOut,
      amountInNumber: amountIn,
      amountInString,
      amountInDecimals,
      dex,
      poolAddress,
    });

    let amountOutBigInt: bigint;
    let executedPrice: number;

    let feeParam: number | undefined = dex.toLowerCase() === "uniswap" ? 500 : undefined;
    let feeTier: number | null = null;
    let poolLiquidity: string | null = null;
    let legPoolAddress = poolAddress || "unknown";

    // For Uniswap, use the fee parameter. Force LINK-specific routing to discover the best pool.
    if (dex.toLowerCase() === "uniswap") {
      feeTier = 500;
      if ([tokenIn, tokenOut].some((token) =>
        token.toLowerCase() === "0xf97f4df75117a78c1a5a0dbb814af92458539fb4".toLowerCase()
      )) {
        const bestPool = await findBestUniswapPool(this.provider, tokenIn, tokenOut);
        if (bestPool) {
          feeParam = bestPool.feeTier;
          feeTier = bestPool.feeTier;
          legPoolAddress = bestPool.poolAddress;
          poolLiquidity = bestPool.liquidity.toString();
        }
        console.debug("[SIMULATOR] LINK Uniswap fee override", {
          tokenIn,
          tokenOut,
          selectedFee: feeParam,
          bestPool,
        });
      }

      if (!legPoolAddress || legPoolAddress === "unknown") {
        if (feeParam !== undefined) {
          try {
            const factory = new ethers.Contract(
              ADDRESSES.UNISWAP_V3_FACTORY,
              UNISWAP_FACTORY_ABI,
              this.provider
            ) as any;
            const uniswapPoolAddress = await factory.getPool(tokenIn, tokenOut, feeParam);
            if (uniswapPoolAddress && uniswapPoolAddress !== ethers.ZeroAddress) {
              legPoolAddress = uniswapPoolAddress;
              const liq = await getPoolLiquidity(this.provider, uniswapPoolAddress);
              poolLiquidity = liq.toString();
            }
          } catch (err) {
            console.debug("[SIMULATOR] failed to discover Uniswap pool info", {
              tokenIn,
              tokenOut,
              feeParam,
              err: String(err),
            });
          }
        }
      }
    }

    try {
      if (tokenOut.toLowerCase() === USDC.toLowerCase()) {
        // Selling token for USDC
        if (dex.toLowerCase() === "uniswap") {
          amountOutBigInt = await getUniswapSellQuote(
            this.provider,
            tokenIn,
            amountInDecimals,
            amountInString,
            feeParam
          );
        } else if (dex.toLowerCase() === "sushi") {
          if (!poolAddress) throw new Error("Sushi requires poolAddress");
          const sushiPool = await enrichPoolMetadataFromAddress(
            this.provider,
            poolAddress,
            "SUSHI",
            "V3",
            feeParam ?? 3000
          );
          amountOutBigInt = await getSushiSellQuote(
            this.provider,
            tokenIn,
            amountInDecimals,
            amountInString,
            sushiPool
          );
        } else if (dex.toLowerCase() === "camelot") {
          if (!poolAddress) throw new Error("Camelot requires poolAddress");
          amountOutBigInt = await getCamelotSellQuote(
            this.provider,
            tokenIn,
            amountInDecimals,
            amountInString,
            poolAddress
          );
        } else {
          throw new Error(`Unknown DEX: ${dex}`);
        }
      } else {
        if (dex.toLowerCase() === "uniswap") {
          if (feeParam === undefined) {
            throw new Error("Uniswap requires a fee parameter");
          }
          amountOutBigInt = await getUniswapQuote(
            this.provider,
            tokenIn,
            tokenOut,
            amountInString,
            amountInDecimals,
            amountOutDecimals,
            feeParam
          );
        } else if (dex.toLowerCase() === "sushi") {
          if (!poolAddress) throw new Error("Sushi requires poolAddress");
          const sushiPool: PoolMetadata = await enrichPoolMetadataFromAddress(
            this.provider,
            poolAddress,
            "SUSHI",
            "V3",
            feeParam ?? 3000
          );
          legPoolAddress = poolAddress;
          poolLiquidity = sushiPool.liquidity.toString();
          amountOutBigInt = await getSushiQuote(
            this.provider,
            tokenIn,
            tokenOut,
            amountInDecimals,
            amountOutDecimals,
            amountInString,
            sushiPool
          );
        } else if (dex.toLowerCase() === "camelot") {
          if (!poolAddress) throw new Error("Camelot requires poolAddress");
          legPoolAddress = poolAddress;
          const liq = await getPoolLiquidity(this.provider, poolAddress);
          poolLiquidity = liq.toString();
          amountOutBigInt = await getCamelotBuyQuote(
            this.provider,
            tokenOut,
            amountOutDecimals,
            amountInString,
            poolAddress
          );
        } else {
          throw new Error(`Unknown DEX: ${dex}`);
        }
      }

        // If we discovered a pool liquidity, enforce MIN_POOL_LIQUIDITY filter
        try {
          if (poolLiquidity !== null && poolLiquidity !== undefined) {
            const liqNum = BigInt(poolLiquidity);
            if (liqNum < RISK.MIN_POOL_LIQUIDITY) {
              logRejectedRoute({ tokenPath: [tokenIn, tokenOut], poolAddress: legPoolAddress, liquidity: poolLiquidity, reason: "liquidity_below_MIN_POOL_LIQUIDITY" });
              throw new Error("Pool liquidity below MIN_POOL_LIQUIDITY");
            }
          }
        } catch (err) {
          // if rejected, bubble up
          throw err;
        }

      const amountOut = parseFloat(
        ethers.formatUnits(amountOutBigInt, amountOutDecimals)
      );
      executedPrice = amountOut / amountIn;

      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        priceExecuted: executedPrice,
        dex,
        poolAddress: legPoolAddress,
        feeTier,
        liquidity: poolLiquidity,
      };
    } catch (error) {
      console.error(
        `Failed to get quote for ${dex} leg (${tokenIn} -> ${tokenOut}):`,
        error
      );
      throw error;
    }
  }

  /**
   * Simulate the complete triangle route
   * USDC -> Token1 -> Token2 -> USDC
   */
  async simulateTriangle(
    route: TriangleRoute,
    initialUSDC: number,
    leg1Dex: string,
    leg2Dex: string,
    leg3Dex: string,
    poolAddresses?: { leg1?: string; leg2?: string; leg3?: string }
  ): Promise<TriangleSimulationResult> {
    const startTime = Date.now();

    try {
      // Leg 1: USDC -> Middle Token
      const leg1 = await this.simulateLeg(
        route.startToken, // USDC
        route.middleToken,
        initialUSDC,
        route.startTokenDecimals, // USDC decimals (6)
        route.middleTokenDecimals,
        leg1Dex,
        poolAddresses?.leg1
      );

      // Leg 2: Middle Token -> End Token
      const leg2 = await this.simulateLeg(
        route.middleToken,
        route.endToken,
        leg1.amountOut,
        route.middleTokenDecimals,
        route.endTokenDecimals,
        leg2Dex,
        poolAddresses?.leg2
      );

      // Leg 3: End Token -> USDC
      const leg3 = await this.simulateLeg(
        route.endToken,
        route.startToken, // Back to USDC
        leg2.amountOut,
        route.endTokenDecimals,
        route.startTokenDecimals,
        leg3Dex,
        poolAddresses?.leg3
      );

      const finalAmount = leg3.amountOut;
      const grossProfit = finalAmount - initialUSDC;
      const profitPercent = (grossProfit / initialUSDC) * 100;

      return {
        route,
        initialAmount: initialUSDC,
        finalAmount,
        grossProfit,
        profitPercent,
        leg1,
        leg2,
        leg3,
        timestamp: Math.floor(Date.now() / 1000),
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error("Triangle simulation failed:", error);
      throw error;
    }
  }
}
