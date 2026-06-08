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
import { runReplayAnalysis } from "./backtest/replayEngine";
import { runExecutionAnalysis } from "./execution/executionPlanner";
import { printExecutionDashboard } from "./analytics/executionDashboard";
import { runScannerAudit } from "./audit/opportunityAuditor";
import { runForensicInvestigation } from "./forensics/forensicReport";
import { saveAlphaDiscoveryReport } from "./research/coverageReport";
import { saveExpansionValidationReport } from "./research/expansionValidation";
import { saveStablecoinReport } from "./research/stablecoinReport";
import { saveStrategyReport } from "./research/strategyReport";
import { saveTriangleReport } from "./research/triangleReport";
import { saveFinalValidationReport } from "./research/finalValidationReport";
import { runPriorityTriangleScan } from "./triangular/triangleEngine";
import { initializeTriangularTables } from "./triangular/triangularDatabase";
import { generateCurveInventoryReport, formatCurveInventoryMarkdown } from "./research/curveResearch";
import { scanPegDeviations, formatPegTable } from "./stablecoin/pegMonitor";
import { runStablecoinCollectionCycle } from "./stablecoin/stablecoinCollector";
import { initializeStablecoinTables } from "./stablecoin/stablecoinDatabase";
import { HistoricalDensity } from "./research/opportunityDensity";
import { Opportunity } from "./types/opportunity";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

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
    console.log("  replay-analysis    - Run Day 21 opportunity replay analysis");
    console.log("  scanner-audit      - Run Day 25.5 scanner quote audit");
    console.log("  quote-forensics    - Run Day 26 quote engine forensics");
    console.log("  alpha-discovery    - Run Day 28 market expansion research");
    console.log("  expansion-validation - Run Day 29 PancakeSwap expansion validation");
    console.log("  stablecoin-research  - Run Day 30 stablecoin research report");
    console.log("  strategy-report      - Run Day 31 strategic direction validation");
    console.log("  triangle-research    - Run Day 32 triangular research report");
    console.log("  final-validation     - Run Day 33 go/no-go validation audit");
    console.log("  triangle-scan        - Single priority triangle scan");
    console.log("  stablecoin-scan      - Single stablecoin peg deviation scan");
    console.log("  curve-inventory      - Curve pool inventory report");
    console.log("  stablecoin-collect   - Run one stablecoin collection cycle");
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

    case "replay-analysis": {
      try {
        const windowSecondsArg = process.argv[3];
        const windowSeconds = windowSecondsArg
          ? parseInt(windowSecondsArg, 10)
          : 3600;
        console.log("Running opportunity replay analysis...");
        const { reportPath } = await runReplayAnalysis(windowSeconds);
        console.log("\n📊 Replay analysis completed!");
        console.log(`Report saved to: ${reportPath}`);
      } catch (error) {
        console.error(`❌ Error running replay analysis:`, error);
      }
      break;
    }

    case "execution-analysis": {
      try {
        const windowSecondsArg = process.argv[3];
        const windowSeconds = windowSecondsArg
          ? parseInt(windowSecondsArg, 10)
          : 3600;
        console.log("Running execution planning analysis...");
        const { dashboard } = await runExecutionAnalysis(windowSeconds);
        console.log("\n📊 Execution planning completed!");
        printExecutionDashboard(dashboard);
      } catch (error) {
        console.error(`❌ Error running execution analysis:`, error);
      }
      break;
    }

    case "quote-forensics": {
      try {
        console.log("Running Day 26 quote forensics...");
        const { data, reportPath } = await runForensicInvestigation();
        console.log("\n🔬 Forensics completed!");
        console.log(`  Profitable opportunities: ${data.profitableCount}`);
        console.log(`  Unique routes analyzed: ${data.uniqueRoutes}`);
        console.log(`  Phantom artifacts: ${data.phantomSpreads.filter((p) => p.isArtifact).length}`);
        console.log(`  Root cause: ${data.rootCause[0] ?? "see report"}`);
        console.log(`  Report: ${reportPath}`);
      } catch (error) {
        console.error(`❌ Error running quote forensics:`, error);
      }
      break;
    }

    case "scanner-audit": {
      try {
        console.log("Running Day 25.5 scanner audit...");
        const summary = await runScannerAudit();
        console.log("📊 Scanner audit completed!");
        console.log(`  Audited: ${summary.auditedCount} opportunities`);
        console.log(`  Unique routes: ${summary.uniqueRoutes}`);
        console.log(`  CONFIRMED: ${summary.report.confirmedCount}`);
        console.log(`  PARTIAL: ${summary.report.partialCount}`);
        console.log(`  FALSE_POSITIVE: ${summary.report.falsePositiveCount}`);
        console.log(`  ACTUALLY_EXECUTABLE: ${summary.report.actuallyExecutableCount}`);
        console.log(`  Report: ${summary.reportPath}`);
      } catch (error) {
        console.error(`❌ Error running scanner audit:`, error);
      }
      break;
    }

    case "alpha-discovery": {
      try {
        console.log("Running Day 28 alpha discovery...");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const historical: HistoricalDensity[] = [
          { token: "ARB", route: "SUSHI -> UNISWAP", count: 77, avgProfit: 1.37, falsePositive: true },
          { token: "ARB", route: "UNISWAP -> SUSHI", count: 24, avgProfit: 0.41, falsePositive: true },
          { token: "WETH", route: "UNISWAP -> SUSHI", count: 1, avgProfit: 23.96, falsePositive: true },
        ];
        const report = await saveAlphaDiscoveryReport(provider, historical);
        console.log("\n📊 Alpha discovery completed!");
        console.log(`  Missing tokens: ${report.tokenCoverage.missing.length}`);
        console.log(`  Missing DEXes: ${report.dexCoverage.missing.length}`);
        console.log(`  Top expansion token: ${report.tokenCoverage.expansionCandidates[0]?.symbol ?? "N/A"}`);
        console.log(`  Top expansion DEX: ${report.dexCoverage.expansionRankings[0]?.name ?? "N/A"}`);
        console.log(`  Report: docs/day28_alpha_discovery.md`);
      } catch (error) {
        console.error(`❌ Error running alpha discovery:`, error);
      }
      break;
    }

    case "expansion-validation": {
      try {
        console.log("Running Day 29 expansion validation...");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const result = await saveExpansionValidationReport(provider);
        console.log("\n📊 Expansion validation completed!");
        console.log(`  Scannable tokens: ${result.tokenCoverage.filter((t) => t.scannable).length}`);
        console.log(`  Routes evaluated: ${result.scanStats.routesEvaluated}`);
        console.log(`  Profitable: ${result.profitable.length}`);
        console.log(`  Report: docs/day29_market_expansion_validation.md`);
      } catch (error) {
        console.error(`❌ Error running expansion validation:`, error);
      }
      break;
    }

    case "final-validation": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        initializeDatabase();
        console.log("Running Day 33 final validation audit...");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const reportPath = await saveFinalValidationReport(provider);
        console.log("\n📊 Final validation report generated!");
        console.log(`  Report: ${reportPath}`);
      } catch (error) {
        console.error(`❌ Error running final validation:`, error);
      }
      break;
    }

    case "triangle-research": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        console.log("Running Day 32 triangular research...");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const skipScan = process.argv[3] === "--no-scan";
        const reportPath = await saveTriangleReport(provider, !skipScan);
        console.log("\n📊 Triangle research report generated!");
        console.log(`  Report: ${reportPath}`);
      } catch (error) {
        console.error(`❌ Error running triangle research:`, error);
      }
      break;
    }

    case "triangle-scan": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        initializeTriangularTables();
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const report = await runPriorityTriangleScan(provider, true);
        console.log(`\n📊 Triangle scan: ${report.routesEvaluated} routes, ${report.profitable} profitable`);
        if (report.best?.quoteSuccess) {
          console.log(`  Best: ${report.best.cycle.label} via ${report.best.dexPathLabel} = $${report.best.netProfit.toFixed(2)}`);
        }
      } catch (error) {
        console.error(`❌ Error running triangle scan:`, error);
      }
      break;
    }

    case "strategy-report": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        console.log("Running Day 31 strategic direction validation...");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const reportPath = await saveStrategyReport(provider);
        console.log("\n📊 Strategy report generated!");
        console.log(`  Report: ${reportPath}`);
      } catch (error) {
        console.error(`❌ Error running strategy report:`, error);
      }
      break;
    }

    case "stablecoin-research": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        console.log("Running Day 30 stablecoin research...");
        initializeStablecoinTables();
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const windowArg = process.argv[3];
        const windowSeconds = windowArg ? parseInt(windowArg, 10) : undefined;
        const reportPath = await saveStablecoinReport(provider, windowSeconds);
        console.log("\n📊 Stablecoin research report generated!");
        console.log(`  Report: ${reportPath}`);
      } catch (error) {
        console.error(`❌ Error running stablecoin research:`, error);
      }
      break;
    }

    case "stablecoin-scan": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const readings = await scanPegDeviations(provider);
        console.log("\n📊 Peg deviation scan:\n");
        console.log(formatPegTable(readings));
      } catch (error) {
        console.error(`❌ Error running stablecoin scan:`, error);
      }
      break;
    }

    case "curve-inventory": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const report = await generateCurveInventoryReport(provider);
        console.log(formatCurveInventoryMarkdown(report));
      } catch (error) {
        console.error(`❌ Error running curve inventory:`, error);
      }
      break;
    }

    case "stablecoin-collect": {
      try {
        if (!process.env.RPC_URL) throw new Error("RPC_URL required");
        initializeStablecoinTables();
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const { readings, comparisons } = await runStablecoinCollectionCycle(provider);
        console.log(`\n📊 Collection cycle complete: ${readings.length} readings, ${comparisons} comparisons`);
        console.log(formatPegTable(readings));
      } catch (error) {
        console.error(`❌ Error running stablecoin collection:`, error);
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
