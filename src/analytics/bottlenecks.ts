import { getBottleneckAnalysis } from "../database/database";

export async function analyzeBottlenecks() {
  const bottlenecks = getBottleneckAnalysis();

  if (bottlenecks.length === 0) {
    console.log("No data available yet. Run the monitor for at least 1 hour.");
    return;
  }

  console.log("\n" + "=".repeat(80));
  console.log("LOSS BOTTLENECK RANKING");
  console.log("=".repeat(80) + "\n");

  console.log("Where is the money disappearing?\n");

  let rank = 1;
  for (const bottleneck of bottlenecks) {
    const percentage = bottleneck.percentage_of_total;
    const barWidth = Math.round(percentage / 2);
    const bar = "█".repeat(Math.max(1, barWidth));
    const spacing = " ".repeat(Math.max(0, 30 - bottleneck.bottleneck.length));

    console.log(
      `${rank}. ${bottleneck.bottleneck}${spacing} ${bar} ${percentage.toFixed(1)}%`
    );
    console.log(
      `   Avg loss: ${bottleneck.total_loss_pct.toFixed(4)}% of trade size`
    );
    console.log("");
    rank++;
  }

  console.log("=".repeat(80));
  console.log("INSIGHTS");
  console.log("=".repeat(80) + "\n");

  const topBottleneck = bottlenecks[0];
  if (topBottleneck && topBottleneck.bottleneck === "Execution Slippage") {
    console.log("🎯 PRIMARY BOTTLENECK: Execution Slippage");
    console.log(
      "   This means: DEX routes are bleeding value through slippage and MEV."
    );
    console.log("\n   Options:");
    console.log("   A) Reduce trade size (slippage scales with size)");
    console.log("   B) Split trades across multiple DEXes");
    console.log("   C) Explore triangular routes with better liquidity");
    console.log("   D) Switch to other DEXes with deeper liquidity");
  } else if (topBottleneck && topBottleneck.bottleneck === "Gas Cost") {
    console.log("🎯 PRIMARY BOTTLENECK: Gas Fees");
    console.log(
      "   This means: Arbitrum gas fees are eating the profit margin."
    );
    console.log("\n   Options:");
    console.log("   A) Increase trade size (amortize gas cost)");
    console.log("   B) Batch multiple trades in one tx");
    console.log("   C) Use gas-optimized contracts");
    console.log("   D) Wait for cheaper gas periods (usually off-peak hours)");
  } else if (topBottleneck && topBottleneck.bottleneck === "Flash Fee") {
    console.log("🎯 PRIMARY BOTTLENECK: Flash Loan Fees");
    console.log("   This means: Flash loan fees are the main cost.");
    console.log("\n   Options:");
    console.log("   A) Use self-funded capital instead of flash loans");
    console.log("   B) Shop different flash loan providers (dydx vs Aave)");
    console.log("   C) Find cheaper arbitrage opportunities with higher margins");
    console.log(
      "   D) Consider if flash loans are necessary (can you do triangular without flash?)"
    );
  }

  console.log("\n" + "=".repeat(80));
}

analyzeBottlenecks().catch(console.error);

