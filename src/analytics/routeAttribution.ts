import { getRouteAttribution } from "../database/database";

export async function analyzeRouteAttribution() {
  const routeData = getRouteAttribution();

  if (routeData.length === 0) {
    console.log("No data available yet. Run the monitor for at least 1 hour.");
    return;
  }

  console.log("\n" + "=".repeat(110));
  console.log("ROUTE ATTRIBUTION ANALYSIS");
  console.log("=".repeat(110) + "\n");

  console.log(
    "ROUTE".padEnd(25) +
      "SCANS".padEnd(8) +
      "SPREAD%".padEnd(10) +
      "GAS%".padEnd(10) +
      "FLASH%".padEnd(10) +
      "EXEC%".padEnd(10) +
      "NET%".padEnd(10) +
      "PROFIT".padEnd(10)
  );
  console.log("-".repeat(110));

  for (const route of routeData) {
    const spreadStr = route.avg_spread_contribution_pct.toFixed(4).padEnd(10);
    const gasStr = route.avg_gas_contribution_pct.toFixed(4).padEnd(10);
    const flashStr = route.avg_flash_contribution_pct.toFixed(4).padEnd(10);
    const execStr = route.avg_execution_contribution_pct.toFixed(4).padEnd(10);
    const netStr = route.avg_net_profit_pct.toFixed(4).padEnd(10);
    const profitStr = route.profitable_count.toString().padEnd(10);

    console.log(
      route.route.padEnd(25) +
        route.count.toString().padEnd(8) +
        spreadStr +
        gasStr +
        flashStr +
        execStr +
        netStr +
        profitStr
    );
  }

  console.log("\n" + "=".repeat(110));
  console.log("ROUTE QUALITY RANKINGS");
  console.log("=".repeat(110));

  // Best routes by spread
  console.log("\n🥇 Best Routes by Market Spread:");
  getRouteAttribution()
    .sort((a, b) => b.avg_spread_contribution_pct - a.avg_spread_contribution_pct)
    .slice(0, 5)
    .forEach((route, idx) => {
      console.log(
        `  ${idx + 1}. ${route.route}: +${route.avg_spread_contribution_pct.toFixed(4)}% spread (${route.count} scans)`
      );
    });

  // Most profitable routes
  console.log("\n💰 Most Profitable Routes:");
  getRouteAttribution()
    .sort((a, b) => b.avg_net_profit_pct - a.avg_net_profit_pct)
    .slice(0, 5)
    .forEach((route, idx) => {
      if (route.avg_net_profit_pct > 0) {
        console.log(
          `  ${idx + 1}. ${route.route}: +${route.avg_net_profit_pct.toFixed(4)}% net (${route.profitable_count}/${route.count} profitable)`
        );
      } else {
        console.log(
          `  ${idx + 1}. ${route.route}: ${route.avg_net_profit_pct.toFixed(4)}% net (${route.profitable_count}/${route.count} profitable)`
        );
      }
    });

  // Worst routes (most negative)
  console.log("\n⚠️ Worst Routes (most negative):");
  getRouteAttribution()
    .sort((a, b) => a.avg_net_profit_pct - b.avg_net_profit_pct)
    .slice(0, 5)
    .forEach((route, idx) => {
      console.log(
        `  ${idx + 1}. ${route.route}: ${route.avg_net_profit_pct.toFixed(4)}% net (${route.profitable_count}/${route.count} profitable)`
      );
    });

  console.log("\n" + "=".repeat(110));
}

analyzeRouteAttribution().catch(console.error);
