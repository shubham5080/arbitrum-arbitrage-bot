import { scanAndSaveMarket } from "../scanner/scanMarket";
import { SETTINGS } from "../config/settings";
import { logOpportunity } from "../utils/logger";
import { initializeDatabase, closeDatabase } from "../database/database";
import { printHourlyDashboard } from "../analytics/dashboard";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Initialize database
  initializeDatabase();

  const seen = new Set<string>();
  let scanCount = 0;
  let bestProfit = Number.NEGATIVE_INFINITY;
  let bestRoute = "";
  let bestToken = "";

  // Setup graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down gracefully...");
    closeDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down gracefully...");
    closeDatabase();
    process.exit(0);
  });

  while (true) {
    scanCount += 1;

    const opportunities = await scanAndSaveMarket();
    const filtered = opportunities.filter(
      (o) => o.netProfit > SETTINGS.MIN_NET_PROFIT
    );

    const newOpportunities = filtered.filter((opp) => {
      const key = `${opp.token}-${opp.route}-${opp.size}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    for (const opp of newOpportunities) {
      logOpportunity(opp);
    }

    for (const opp of filtered) {
      if (opp.netProfit > bestProfit) {
        bestProfit = opp.netProfit;
        bestRoute = opp.route;
        bestToken = opp.token;
      }
    }

    console.clear();
    console.log(new Date().toISOString());
    console.table(filtered.slice(0, 10));

    if (scanCount % 12 === 0) {
      console.log("===================");
      console.log(`SCANS: ${scanCount}`);
      console.log("");
      console.log("BEST TOKEN:", bestToken || "N/A");
      console.log("");
      console.log("BEST ROUTE:", bestRoute || "N/A");
      console.log("");
      console.log(
        "BEST PROFIT:",
        bestProfit === Number.NEGATIVE_INFINITY
          ? "N/A"
          : bestProfit.toFixed(6)
      );
      console.log("===================");
    }

    // Print hourly dashboard (every hour, i.e., every 720 scans at 5s intervals)
    if (scanCount % 720 === 0) {
      printHourlyDashboard();
    }

    await sleep(5000);
  }
}

main().catch(console.error);
