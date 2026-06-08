/**
 * Day 18: Triangle Route Tester
 * 
 * Tests triangular arbitrage with:
 * USDC -> ARB -> WETH -> USDC
 * 
 * Run: npx ts-node src/strategies/triangular/testTriangle.ts
 */

import { ethers } from "ethers";
import { TriangleRoute } from "./types";
import { TriangleSimulator } from "./triangleSimulator";
import {
  initializeTriangleTable,
  saveTriangleOpportunity,
  getTopTriangleOpportunities,
  getTriangleStatistics,
  getMostProfitableRoutes,
} from "./triangleDatabase";
import { TOKENS } from "../../config/tokens";
import { ADDRESSES } from "../../config/addresses";
import { findBestSushiPool } from "../../discovery/sushiPoolDiscovery";
import { findBestCamelotPool } from "../../discovery/camelotPoolDiscovery";
import { getUniswapSellQuote } from "../../quotes/quoteEngine";
import { generateRoutes, routeName } from "./routeGenerator";
import fs from "fs";
import path from "path";

// Arbitrum RPC endpoint
const RPC_URL = "https://arb1.arbitrum.io/rpc";

async function main() {
  console.log("=".repeat(60));
  console.log("Day 18: Triangle Arbitrage Simulator");
  console.log("=".repeat(60));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  initializeTriangleTable();
  const simulator = new TriangleSimulator(provider);
  const routes = generateRoutes();

  const camelotPoolWETH_USDC = await findBestCamelotPool(provider, TOKENS.WETH.address, ADDRESSES.USDC);
  if (!camelotPoolWETH_USDC) {
    console.warn("Warning: Could not find Camelot pool for WETH/USDC; Camelot legs will be skipped if required.");
  }

  const testAmounts = [100, 500, 1000, 5000];

  for (const route of routes) {
    console.log(`\n📍 Route Configuration: ${routeName(route)}`);
    console.log(`   Start:  USDC (${route.startToken})`);
    console.log(`   Middle: ${route.middleToken}`);
    console.log(`   End:    ${route.endToken}`);

    const sushiPoolStartMiddle = await findBestSushiPool(provider, route.startToken, route.middleToken);
    const sushiPoolMiddleEnd = await findBestSushiPool(provider, route.middleToken, route.endToken);

    if (!sushiPoolStartMiddle) {
      console.warn(`Warning: Could not find Sushi pool for ${route.startToken}/${route.middleToken}.`);
    }
    if (!sushiPoolMiddleEnd) {
      console.warn(`Warning: Could not find Sushi pool for ${route.middleToken}/${route.endToken}.`);
    }

    for (const initialUSDC of testAmounts) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Testing with ${initialUSDC} USDC`);
      console.log("=".repeat(60));

      try {
        console.log(`\n🔄 DEX Combination: Uniswap -> Sushi -> (Camelot|Uniswap)`);
        const poolAddresses1: any = {};
        if (sushiPoolMiddleEnd?.poolAddress) poolAddresses1.leg2 = sushiPoolMiddleEnd.poolAddress;
        const finalDex1 = camelotPoolWETH_USDC ? "camelot" : "uniswap";
        if (finalDex1 === "camelot" && camelotPoolWETH_USDC?.poolAddress) poolAddresses1.leg3 = camelotPoolWETH_USDC.poolAddress;

        const result1 = await simulator.simulateTriangle(
          route,
          initialUSDC,
          "uniswap",
          "sushi",
          finalDex1,
          poolAddresses1
        );

        console.log(`\n✅ Leg 1 (Uniswap): ${initialUSDC.toFixed(2)} USDC -> ${result1.leg1.amountOut.toFixed(4)} ${route.middleToken}`);
        console.log(`   Price: ${result1.leg1.priceExecuted.toFixed(6)} ${route.middleToken}/USDC`);
        console.log(`\n✅ Leg 2 (Sushi): ${result1.leg1.amountOut.toFixed(4)} ${route.middleToken} -> ${result1.leg2.amountOut.toFixed(4)} ${route.endToken}`);
        console.log(`   Price: ${result1.leg2.priceExecuted.toFixed(6)} ${route.endToken}/${route.middleToken}`);
        console.log(`\n✅ Leg 3 (${finalDex1.toUpperCase()}): ${result1.leg2.amountOut.toFixed(4)} ${route.endToken} -> ${result1.finalAmount.toFixed(2)} USDC`);
        console.log(`   Price: ${result1.leg3.priceExecuted.toFixed(6)} USDC/${route.endToken}`);

        console.log(`\n${"=".repeat(60)}`);
        console.log("📊 Simulation Results");
        console.log("=".repeat(60));
        console.log(`Initial Amount:  ${result1.initialAmount.toFixed(2)} USDC`);
        console.log(`Final Amount:    ${result1.finalAmount.toFixed(2)} USDC`);
        console.log(`Gross Profit:    ${result1.grossProfit >= 0 ? "+" : ""}${result1.grossProfit.toFixed(2)} USDC`);
        console.log(`Profit %:        ${result1.profitPercent >= 0 ? "+" : ""}${result1.profitPercent.toFixed(4)}%`);
        console.log(`Execution Time:  ${result1.executionTime}ms`);

        saveTriangleOpportunity(result1);

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ?? 1000000000n;
        const totalGasUnits = 360000n;
        const gasCostWei = gasPrice * totalGasUnits;
        const gasCostEth = parseFloat(ethers.formatUnits(gasCostWei, 18));
        const gasCostEthStr = gasCostEth.toFixed(18);
        const usdcGasBig = await getUniswapSellQuote(provider, TOKENS.WETH.address, TOKENS.WETH.decimals, gasCostEthStr);
        const gasCostUSDC = parseFloat(ethers.formatUnits(usdcGasBig, 6));
        const netProfit = result1.grossProfit - gasCostUSDC;
        const out1 = {
          route: routeName(route),
          initialAmount: result1.initialAmount,
          finalAmount: result1.finalAmount,
          profit: result1.grossProfit,
          spread: result1.profitPercent,
          gas: gasCostUSDC,
          netProfit,
          dexCombo: `${"uniswap"}->${"sushi"}->${finalDex1}`,
          legPoolAddresses: [
            result1.leg1.poolAddress,
            result1.leg2.poolAddress,
            result1.leg3.poolAddress,
          ],
          legFeeTiers: [
            result1.leg1.feeTier ?? null,
            result1.leg2.feeTier ?? null,
            result1.leg3.feeTier ?? null,
          ],
          legLiquidities: [
            result1.leg1.liquidity ?? null,
            result1.leg2.liquidity ?? null,
            result1.leg3.liquidity ?? null,
          ],
          legOutputs: [
            result1.leg1.amountOut,
            result1.leg2.amountOut,
            result1.leg3.amountOut,
          ],
        };
        fs.appendFileSync(path.join(__dirname, "../../../logs/triangle_results.jsonl"), JSON.stringify(out1) + "\n");

        console.log(`\n🔄 DEX Combination: Sushi -> Uniswap -> (Camelot|Uniswap)`);
        const poolAddresses2: any = {};
        if (sushiPoolStartMiddle?.poolAddress) poolAddresses2.leg1 = sushiPoolStartMiddle.poolAddress;
        const finalDex2 = camelotPoolWETH_USDC ? "camelot" : "uniswap";
        if (finalDex2 === "camelot" && camelotPoolWETH_USDC?.poolAddress) poolAddresses2.leg3 = camelotPoolWETH_USDC.poolAddress;

        const result2 = await simulator.simulateTriangle(
          route,
          initialUSDC,
          "sushi",
          "uniswap",
          finalDex2,
          poolAddresses2
        );

        console.log(`\n✅ Leg 1 (Sushi): ${initialUSDC.toFixed(2)} USDC -> ${result2.leg1.amountOut.toFixed(4)} ${route.middleToken}`);
        console.log(`   Price: ${result2.leg1.priceExecuted.toFixed(6)} ${route.middleToken}/USDC`);
        console.log(`\n✅ Leg 2 (Uniswap): ${result2.leg1.amountOut.toFixed(4)} ${route.middleToken} -> ${result2.leg2.amountOut.toFixed(4)} ${route.endToken}`);
        console.log(`   Price: ${result2.leg2.priceExecuted.toFixed(6)} ${route.endToken}/${route.middleToken}`);
        console.log(`\n✅ Leg 3 (${finalDex2.toUpperCase()}): ${result2.leg2.amountOut.toFixed(4)} ${route.endToken} -> ${result2.finalAmount.toFixed(2)} USDC`);
        console.log(`   Price: ${result2.leg3.priceExecuted.toFixed(6)} USDC/${route.endToken}`);

        console.log(`\n${"=".repeat(60)}`);
        console.log("📊 Simulation Results");
        console.log("=".repeat(60));
        console.log(`Initial Amount:  ${result2.initialAmount.toFixed(2)} USDC`);
        console.log(`Final Amount:    ${result2.finalAmount.toFixed(2)} USDC`);
        console.log(`Gross Profit:    ${result2.grossProfit >= 0 ? "+" : ""}${result2.grossProfit.toFixed(2)} USDC`);
        console.log(`Profit %:        ${result2.profitPercent >= 0 ? "+" : ""}${result2.profitPercent.toFixed(4)}%`);
        console.log(`Execution Time:  ${result2.executionTime}ms`);

        saveTriangleOpportunity(result2);

        const out2 = {
          route: routeName(route),
          initialAmount: result2.initialAmount,
          finalAmount: result2.finalAmount,
          profit: result2.grossProfit,
          spread: result2.profitPercent,
          gas: gasCostUSDC,
          netProfit: result2.grossProfit - gasCostUSDC,
          dexCombo: `${"sushi"}->${"uniswap"}->${finalDex2}`,
          legPoolAddresses: [
            result2.leg1.poolAddress,
            result2.leg2.poolAddress,
            result2.leg3.poolAddress,
          ],
          legFeeTiers: [
            result2.leg1.feeTier ?? null,
            result2.leg2.feeTier ?? null,
            result2.leg3.feeTier ?? null,
          ],
          legLiquidities: [
            result2.leg1.liquidity ?? null,
            result2.leg2.liquidity ?? null,
            result2.leg3.liquidity ?? null,
          ],
          legOutputs: [
            result2.leg1.amountOut,
            result2.leg2.amountOut,
            result2.leg3.amountOut,
          ],
        };
        fs.appendFileSync(path.join(__dirname, "../../../logs/triangle_results.jsonl"), JSON.stringify(out2) + "\n");
      } catch (error) {
        console.error(`❌ Error testing with ${initialUSDC} USDC:`, error);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("📈 Database Statistics");
  console.log("=".repeat(60));

  const stats = getTriangleStatistics();
  console.log(`Total Opportunities:  ${stats.totalOpportunities}`);
  console.log(`Average Profit %:     ${stats.averageProfit.toFixed(4)}%`);
  console.log(`Max Profit %:         ${stats.maxProfit.toFixed(4)}%`);
  console.log(`Min Profit %:         ${stats.minProfit.toFixed(4)}%`);
  console.log(`Profitable Routes:    ${stats.profitableCount}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("🏆 Top 5 Triangle Opportunities");
  console.log("=".repeat(60));

  const topOpps = getTopTriangleOpportunities(5);
  topOpps.forEach((opp, idx) => {
    console.log(
      `${idx + 1}. ${opp.route_name}: ${opp.profit_percent.toFixed(4)}% profit (${opp.gross_profit.toFixed(2)} USDC)`
    );
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log("🎯 Most Profitable Routes (by average)");
  console.log("=".repeat(60));

  const profitableRoutes = getMostProfitableRoutes(5);
  profitableRoutes.forEach((route, idx) => {
    console.log(
      `${idx + 1}. ${route.routeName}: ${route.avgProfit.toFixed(4)}% avg profit (${route.count} samples)`
    );
  });

  console.log("\n✅ Triangle simulator test complete!");
}

main().catch(console.error);
