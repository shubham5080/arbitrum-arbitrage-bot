import {
  initializeDatabase,
  saveOpportunity,
  getOpportunitiesSince,
  countOpportunitiesSince,
  clearOldOpportunities,
  closeDatabase,
} from "./database/database";
import {
  getStats1Hour,
  getStats24Hours,
  getStatsAllTime,
  getOpportunityLifetime,
} from "./analytics/stats";
import { formatStats } from "./analytics/dashboard";
import { generateReport, saveReport } from "./analytics/reportGenerator";
import { Opportunity } from "./types/opportunity";

async function main() {
  initializeDatabase();

  console.log("=== Database Tools ===\n");

  // Get command from args
  const command = process.argv[2];

  if (!command) {
    console.log("Usage: npx ts-node src/tools.ts <command> [args]");
    console.log("\nCommands:");
    console.log("  stats-1h           - Show stats for last 1 hour");
    console.log("  stats-24h          - Show stats for last 24 hours");
    console.log("  stats-all          - Show all-time stats");
    console.log("  count-5min         - Count opportunities in last 5 minutes");
    console.log("  count-1h           - Count opportunities in last 1 hour");
    console.log("  generate-report    - Generate Day 14 research report");
    console.log("  cleanup-7d         - Delete opportunities older than 7 days");
    console.log("  lifetime <token> <route> <size> - Track opportunity lifetime");
    console.log("  test-save          - Test saving a sample opportunity");
    closeDatabase();
    return;
  }

  switch (command) {
    case "stats-1h": {
      const stats = getStats1Hour();
      console.log(formatStats(stats));
      break;
    }

    case "stats-24h": {
      const stats = getStats24Hours();
      console.log(formatStats(stats));
      break;
    }

    case "stats-all": {
      const stats = getStatsAllTime();
      console.log(formatStats(stats));
      break;
    }

    case "count-5min": {
      const count = countOpportunitiesSince(5 * 60);
      console.log(`Opportunities in last 5 minutes: ${count}`);
      break;
    }

    case "count-1h": {
      const count = countOpportunitiesSince(60 * 60);
      console.log(`Opportunities in last 1 hour: ${count}`);
      break;
    }

    case "generate-report": {
      try {
        console.log("Generating Day 14 research report...");
        const report = generateReport();
        saveReport(report);
        console.log("\n📊 Report successfully generated!");
        console.log(`\nSummary:`);
        console.log(`- Total Scans: ${report.totalOpportunities}`);
        console.log(`- Profitable: ${report.profitableOpportunities} (${report.profitPercentage}%)`);
        console.log(`- Total Profit: $${report.totalProfit} USDC`);
        console.log(`- Duration: ${report.durationHours} hours`);
        const bestToken = report.tokens[0];
        const bestRoute = report.routes[0];
        console.log(`- Best Token: ${bestToken ? bestToken.token : "N/A"}`);
        console.log(`- Best Route: ${bestRoute ? bestRoute.route : "N/A"}`);
      } catch (error) {
        console.error(`❌ Error generating report:`, error);
      }
      break;
    }

    case "cleanup-7d": {
      const deleted = clearOldOpportunities(7);
      console.log(`Deleted ${deleted} opportunities older than 7 days`);
      break;
    }

    case "lifetime": {
      const token = process.argv[3];
      const route = process.argv[4];
      const sizeStr = process.argv[5];
      const size = sizeStr ? parseFloat(sizeStr) : NaN;

      if (!token || !route || isNaN(size)) {
        console.error("Usage: npx ts-node src/tools.ts lifetime <token> <route> <size>");
        console.error("Example: npx ts-node src/tools.ts lifetime LINK 'UNI -> SUSHI' 100");
        break;
      }

      const lifetime = getOpportunityLifetime(token, route, size, 3600);
      console.log(`\nOpportunity Lifetime Analysis:`);
      console.log(`Token: ${token}`);
      console.log(`Route: ${route}`);
      console.log(`Size: $${size} USDC`);
      console.log(`Total occurrences: ${lifetime.count}`);
      console.log(`Number of instances: ${lifetime.instances}`);
      console.log(`Average duration per instance: ${lifetime.avgDuration}s`);
      break;
    }

    case "test-save": {
      // Create a test opportunity
      const testOpp: Opportunity = {
        token: "LINK",
        route: "UNISWAP -> SUSHI",
        size: 500,
        grossProfit: 2.5,
        gasCost: 0.3,
        flashFee: 0.05,
        netProfit: 2.15,
        score: 0.0043,
        buyPrice: 10.5,
        sellPrice: 10.51,
        spreadPercent: 0.095,
        slippageImpact: 5.2,
        spreadContribution: 0.5,
        gasContribution: -0.3,
        flashContribution: -0.05,
        executionContribution: 2.0,
        liquidity: "1000000",
        feeTier: 500,
        poolAddress: "0x123456789abcdef",
      };

      const id = saveOpportunity(testOpp);
      console.log(`Test opportunity saved with ID: ${id}`);

      // Retrieve and display
      const opps = getOpportunitiesSince(300);
      console.log(`\nRetrieved ${opps.length} opportunities from last 5 minutes:`);
      console.table(opps.slice(0, 5));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run without arguments to see available commands");
  }

  closeDatabase();
}

main().catch(console.error);
