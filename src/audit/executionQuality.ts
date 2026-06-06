import dotenv from "dotenv";
import { getTokenBreakdown } from "../database/database";

dotenv.config();

async function main() {
  console.log("\n=== Day 16: Execution Quality Analysis ===\n");

  try {
    const breakdown = getTokenBreakdown();

    if (breakdown.length === 0) {
      console.log("No opportunities found yet. Keep the monitor running.\n");
      return;
    }

    console.log("Token Diagnostics: Spread | Slippage | Net Profit\n");
    console.log(
      "Token  | Scans | Profit% | Avg Spread | Avg Slippage | Avg Net Profit | Min Spread | Max Spread"
    );
    console.log("-------|-------|---------|-----------|--------------|----------------|-----------|----------");

    for (const token of breakdown) {
      const profitRate = ((token.profitable_count / token.count) * 100).toFixed(1);
      console.log(
        `${token.token.padEnd(6)}| ${String(token.count).padEnd(6)}| ${profitRate.padEnd(8)}| ${String(token.avg_spread).padEnd(10)}| ${String(token.avg_slippage).padEnd(13)}| ${String(token.avg_net_profit).padEnd(15)}| ${String(token.min_spread).padEnd(10)}| ${String(token.max_spread)}`
      );
    }

    console.log("\n=== Interpretation ===\n");

    for (const token of breakdown) {
      console.log(`${token.token}:`);
      console.log(`  Spread: ${token.avg_spread}% (range: ${token.min_spread}% to ${token.max_spread}%)`);
      console.log(`  Slippage costs: ${token.avg_slippage}% of gross profit`);
      console.log(`  Profitable trades: ${token.profitable_count}/${token.count} (${((token.profitable_count / token.count) * 100).toFixed(1)}%)`);

      if (token.avg_spread > 0 && token.avg_net_profit < 0) {
        console.log(`  ⚠️  Market has spread, but execution costs eliminate profit`);
      } else if (token.avg_spread <= 0) {
        console.log(`  ❌ No positive spread - market is efficient`);
      } else if (token.avg_net_profit > 0) {
        console.log(`  ✅ Profitable arbitrage detected`);
      }
      console.log();
    }

    console.log("=== Next Steps ===\n");
    console.log("If you see:");
    console.log("  Spread > 0% but Net Profit < 0% → Consider triangular routes");
    console.log("  Spread > 0% and Net Profit > 0% → Production-ready");
    console.log("  Spread ≤ 0% → Market too efficient, expand search space\n");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
