import { getTokenAttribution } from "../database/database";

export async function analyzeTokenAttribution() {
  const tokenData = getTokenAttribution();

  if (tokenData.length === 0) {
    console.log("No data available yet. Run the monitor for at least 1 hour.");
    return;
  }

  console.log("\n" + "=".repeat(100));
  console.log("TOKEN ATTRIBUTION ANALYSIS");
  console.log("=".repeat(100) + "\n");

  console.log(
    "TOKEN".padEnd(10) +
      "SCANS".padEnd(8) +
      "SPREAD%".padEnd(10) +
      "GAS%".padEnd(10) +
      "FLASH%".padEnd(10) +
      "EXEC%".padEnd(10) +
      "NET%".padEnd(10) +
      "PROFIT".padEnd(10)
  );
  console.log("-".repeat(100));

  for (const token of tokenData) {
    const spreadStr = token.avg_spread_contribution_pct.toFixed(4).padEnd(10);
    const gasStr = token.avg_gas_contribution_pct.toFixed(4).padEnd(10);
    const flashStr = token.avg_flash_contribution_pct.toFixed(4).padEnd(10);
    const execStr = token.avg_execution_contribution_pct.toFixed(4).padEnd(10);
    const netStr = token.avg_net_profit_pct.toFixed(4).padEnd(10);
    const profitStr = token.profitable_count.toString().padEnd(10);

    console.log(
      token.token.padEnd(10) +
        token.count.toString().padEnd(8) +
        spreadStr +
        gasStr +
        flashStr +
        execStr +
        netStr +
        profitStr
    );
  }

  console.log("\n" + "=".repeat(100));
  console.log("INTERPRETATION GUIDE");
  console.log("=".repeat(100));

  for (const token of tokenData) {
    console.log(`\n${token.token}:`);

    if (token.avg_spread_contribution_pct > 0) {
      console.log(
        `  ✓ Market Spread: +${token.avg_spread_contribution_pct.toFixed(4)}% (opportunity exists)`
      );
    } else {
      console.log(
        `  ✗ Market Spread: ${token.avg_spread_contribution_pct.toFixed(4)}% (too efficient)`
      );
    }

    console.log(
      `  ✗ Gas Impact:     ${token.avg_gas_contribution_pct.toFixed(4)}% (per trade)`
    );
    console.log(
      `  ✗ Flash Fee:      ${token.avg_flash_contribution_pct.toFixed(4)}% (per trade)`
    );
    console.log(
      `  ✗ Execution Cost: ${token.avg_execution_contribution_pct.toFixed(4)}% (slippage)`
    );

    if (token.avg_net_profit_pct > 0) {
      console.log(
        `  ✓ NET PROFIT:     +${token.avg_net_profit_pct.toFixed(4)}% (PROFITABLE)`
      );
    } else {
      console.log(
        `  ✗ NET PROFIT:     ${token.avg_net_profit_pct.toFixed(4)}% (unprofitable)`
      );
    }

    // Diagnosis
    if (token.avg_spread_contribution_pct > 0 && token.avg_net_profit_pct < 0) {
      const totalCosts = Math.abs(
        token.avg_gas_contribution_pct +
          token.avg_flash_contribution_pct +
          token.avg_execution_contribution_pct
      );
      console.log(
        `  → DIAGNOSIS: Market has ${token.avg_spread_contribution_pct.toFixed(4)}% spread but costs eat ${totalCosts.toFixed(4)}%`
      );
      console.log(`  → ACTION: Optimize execution (reduce slippage) or find triangular routes`);
    } else if (token.avg_spread_contribution_pct <= 0) {
      console.log(`  → DIAGNOSIS: Market is too efficient for 2-DEX arbitrage`);
      console.log(`  → ACTION: Expand to more tokens/DEXes or look for triangular opportunities`);
    } else {
      console.log(`  → DIAGNOSIS: Profitable! Ready for production`);
    }
  }

  console.log("\n" + "=".repeat(100));
}

analyzeTokenAttribution().catch(console.error);
