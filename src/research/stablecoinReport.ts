import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { STABLECOIN_SYMBOLS, STABLECOINS } from "../stablecoin/stablecoinConfig";
import { MONITORED_PAIRS } from "../stablecoin/stablecoinPairs";
import {
  generateCurveInventoryReport,
  formatCurveInventoryMarkdown,
} from "./curveResearch";
import { scanPegDeviations, formatPegTable } from "../stablecoin/pegMonitor";
import { compareDexPrices, formatDexComparisonMarkdown } from "../stablecoin/dexComparison";
import {
  analyzeDeviations,
  formatDeviationAnalysisMarkdown,
  formatDurationAnalysisMarkdown,
} from "../stablecoin/opportunityAnalysis";
import {
  countPegSnapshots,
  getPegSnapshotsSince,
  initializeStablecoinTables,
} from "../stablecoin/stablecoinDatabase";
import { estimateExecutionGas } from "../execution/gasEstimator";
import { initializeDatabase } from "../database/database";

export interface StablecoinResearchReport {
  generatedAt: string;
  collectionHours: number;
  snapshotCount: number;
  successCriteria: Record<string, string>;
}

function formatUniverseSection(): string {
  const lines = [
    "## Stablecoin Universe",
    "",
    "| Symbol | Address | Decimals | Peg Target |",
    "|--------|---------|----------|------------|",
  ];
  for (const sym of STABLECOIN_SYMBOLS) {
    const c = STABLECOINS[sym];
    lines.push(`| ${c.symbol} | \`${c.address}\` | ${c.decimals} | $${c.pegTarget.toFixed(2)} |`);
  }
  lines.push("", "### Monitored Pairs", "");
  for (const p of MONITORED_PAIRS) {
    lines.push(`- ${p.label} (\`${p.id}\`)`);
  }
  return lines.join("\n");
}

function formatPotentialArbitrage(
  analysis: ReturnType<typeof analyzeDeviations>,
  gasCostUsd: number,
  flashFeeUsd: number,
  maxDexDivergenceBps: number
): string {
  const gasBps = (gasCostUsd / 10_000) * 10_000;
  const flashBps = (flashFeeUsd / 10_000) * 10_000;
  const totalBps = gasBps + flashBps;

  return [
    "## Potential Arbitrage",
    "",
    `At $10,000 trade size:`,
    `- Gas cost: ~$${gasCostUsd.toFixed(2)} (${gasBps.toFixed(2)} bps)`,
    `- Flash fee (0.09%): ~$${flashFeeUsd.toFixed(2)} (${flashBps.toFixed(2)} bps)`,
    `- Total friction: ~${totalBps.toFixed(2)} bps`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Max peg deviation observed | ${analysis.maxDeviationBps.toFixed(2)} bps |`,
    `| Avg |deviation| | ${analysis.avgAbsDeviationBps.toFixed(2)} bps |`,
    `| Max cross-venue divergence | ${maxDexDivergenceBps.toFixed(2)} bps |`,
    `| Episodes ≥1 bps | ${analysis.frequency["1-5"] + analysis.frequency["5-10"] + analysis.frequency["10+"]} |`,
    `| Episodes ≥10 bps | ${analysis.frequency["10+"]} |`,
    "",
    analysis.maxDeviationBps > totalBps
      ? "Some deviations exceed estimated gas + flash fees at $10k size."
      : "Observed deviations are below gas + flash fee threshold at $10k size.",
  ].join("\n");
}

function formatRecommendations(
  analysis: ReturnType<typeof analyzeDeviations>,
  maxDexDivergenceBps: number,
  curvePoolCount: number,
  totalCostBps: number
): string {
  const promising =
    analysis.maxDeviationBps >= 5 ||
    maxDexDivergenceBps >= 5 ||
    analysis.frequency["5-10"] + analysis.frequency["10+"] > 0;

  const lines = [
    "## Recommendations",
    "",
    "### Success Criteria Answers",
    "",
    `1. **Do stablecoin deviations occur?** ${analysis.totalSnapshots > 0 && analysis.maxDeviationBps > 0 ? "Yes" : "Insufficient data"}`,
    `2. **How often?** ${analysis.frequency["1-5"] + analysis.frequency["5-10"] + analysis.frequency["10+"]} snapshots ≥1 bps of ${analysis.totalSnapshots} total`,
    `3. **How large?** Max ${analysis.maxDeviationBps.toFixed(2)} bps, avg |dev| ${analysis.avgAbsDeviationBps.toFixed(2)} bps`,
    `4. **How long do they persist?** Avg ${analysis.durationStats.avgDurationSec}s, max ${analysis.durationStats.maxDurationSec}s (${analysis.durationStats.count} completed episodes)`,
    `5. **Larger than gas + flash fees?** ${analysis.maxDeviationBps > totalCostBps ? "Sometimes at observed peaks" : "Generally no at $10k size"}`,
    `6. **More promising than spot arb?** ${promising ? "Potentially — stablecoin spreads show measurable divergence vs zero spot arb" : "Not yet — deviations too small vs costs"}`,
    `7. **Build dedicated stablecoin scanner (Day 31)?** ${promising ? "**Yes** — sufficient signal to prototype Curve-integrated scanner" : "**Defer** — extend collection to 48h or increase trade size before committing"}`,
    "",
    "### Next Steps",
    "",
    curvePoolCount > 0
      ? "- Curve has active stable pools on Arbitrum — integrate `get_dy` quoter into scanner"
      : "- Verify Curve pool discovery; MetaRegistry may need updated ABI",
    "- Run collector for full 24–48h window for statistically meaningful duration data",
    "- Test at $50k–$100k quote sizes where 1–3 bps becomes material",
    "- Compare against Day 29 spot arb baseline (0 profitable routes)",
  ];

  return lines.join("\n");
}

export async function generateStablecoinReport(
  provider: ethers.Provider,
  collectionSeconds?: number
): Promise<string> {
  initializeDatabase();
  initializeStablecoinTables();

  const snapshotCount = countPegSnapshots();
  const windowSeconds = collectionSeconds ?? 48 * 3600;
  const analysis = analyzeDeviations(windowSeconds);

  const curveReport = await generateCurveInventoryReport(provider);
  const liveReadings = await scanPegDeviations(provider);
  const dexComparisons = await compareDexPrices(provider);
  const maxDexDiv = Math.max(...dexComparisons.map((c) => c.maxDivergenceBps), 0);

  const gas = await estimateExecutionGas(provider, 10_000);
  const flashFee = 10_000 * 0.0009;
  const totalCostBps = ((gas.gasCostUSD + flashFee) / 10_000) * 10_000;

  const snapshots =
    analysis.totalSnapshots > 0 ? getPegSnapshotsSince(windowSeconds) : [];
  const collectionHours =
    snapshots.length >= 2
      ? ((snapshots[snapshots.length - 1]!.timestamp - snapshots[0]!.timestamp) / 3600).toFixed(2)
      : snapshots.length === 1
        ? "<0.01"
        : "0";

  const sections = [
    "# Day 30: Stablecoin Peg Arbitrage Research",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Executive Summary",
    "",
    `- Snapshots collected: **${snapshotCount}**`,
    `- Collection window: **${collectionHours}h**`,
    `- Curve stable pools found: **${curveReport.monitoredStablePools.length}**`,
    `- Max peg deviation: **${analysis.maxDeviationBps.toFixed(2)} bps**`,
    `- Max cross-venue divergence: **${maxDexDiv.toFixed(2)} bps**`,
    "",
    formatUniverseSection(),
    "",
    formatCurveInventoryMarkdown(curveReport),
    "",
    "## Peg Deviations (Live Snapshot)",
    "",
    formatPegTable(liveReadings),
    "",
    formatDeviationAnalysisMarkdown(analysis),
    "",
    formatDurationAnalysisMarkdown(analysis.durationStats),
    "",
    formatDexComparisonMarkdown(dexComparisons),
    "",
    formatPotentialArbitrage(analysis, gas.gasCostUSD, flashFee, maxDexDiv),
    "",
    formatRecommendations(analysis, maxDexDiv, curveReport.monitoredStablePools.length, totalCostBps),
  ];

  return sections.join("\n");
}

export async function saveStablecoinReport(
  provider: ethers.Provider,
  collectionSeconds?: number
): Promise<string> {
  const report = await generateStablecoinReport(provider, collectionSeconds);
  const reportPath = path.join(__dirname, "../../docs/day30_stablecoin_research.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  return reportPath;
}
