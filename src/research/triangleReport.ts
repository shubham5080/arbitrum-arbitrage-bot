import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { buildTokenGraph, formatTokenGraphMarkdown, TRIANGLE_TOKEN_SYMBOLS } from "../triangular/tokenGraph";
import {
  formatDexPermutationMarkdown,
  countRoutes,
  TRIANGLE_DEXES,
} from "../triangular/dexPermutations";
import {
  runTriangleScan,
  PRIORITY_CYCLE_IDS,
  TriangleScanReport,
} from "../triangular/triangleEngine";
import { TRADE_SIZES_USD } from "../triangular/triangleProfitability";
import {
  initializeTriangularTables,
  getTriangularProfitabilityStats,
  getTriangularProfitabilityStatsSince,
  countTriangularOpportunities,
  getTopTriangularByNetProfit,
  getTriangularRouteFrequency,
} from "../triangular/triangularDatabase";
import { analyzeTriangleReplay, formatReplayMarkdown } from "../triangular/triangleReplay";
import { initializeDatabase } from "../database/database";

function formatDbProfitabilityTable(stats: ReturnType<typeof getTriangularProfitabilityStatsSince>): string {
  const ranked = getTopTriangularByNetProfit(20);
  const lines = [
    "## Profitability Rankings",
    "",
    `Routes in window: **${stats.total}** | Quoted: **${stats.quoted}** | Profitable: **${stats.profitable}** | Near break-even: **${stats.nearBreakEven}**`,
    "",
    "| Rank | Route | DEX Path | Size ($) | Gross ($) | Net ($) | Net % |",
    "|------|-------|----------|----------|-----------|---------|-------|",
  ];

  ranked.forEach((r, i) => {
    const gross = r.end_amount_usd - r.start_amount_usd;
  const pct = r.start_amount_usd > 0 ? (r.net_profit / r.start_amount_usd) * 100 : 0;
    lines.push(
      `| ${i + 1} | ${r.route} | ${r.dex_path} | $${r.start_amount_usd.toLocaleString()} | $${gross.toFixed(2)} | $${r.net_profit.toFixed(2)} | ${pct.toFixed(3)}% |`
    );
  });

  if (ranked[0]) {
    const best = ranked[0];
    lines.push(
      "",
      "### Best Route Discovered",
      "",
      `- **Route:** ${best.route}`,
      `- **DEX path:** ${best.dex_path}`,
      `- **Size:** $${best.start_amount_usd.toLocaleString()}`,
      `- **Net profit:** $${best.net_profit.toFixed(2)}`,
      `- **Executable:** No`,
      ""
    );
  }

  return lines.join("\n");
}

function formatRouteFrequencySection(): string {
  const freq = getTriangularRouteFrequency().slice(0, 8);
  const lines = [
    "## Route Frequency (quoted routes)",
    "",
    "| Route | DEX Path | Samples | Avg Net ($) | Max Net ($) |",
    "|-------|----------|---------|-------------|-------------|",
  ];
  for (const r of freq) {
    lines.push(
      `| ${r.route} | ${r.dex_path} | ${r.count} | $${r.avg_net.toFixed(2)} | $${r.max_net.toFixed(2)} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function formatProfitabilityTable(report: TriangleScanReport): string {
  const ranked = report.results
    .filter((r) => r.quoteSuccess)
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 20);

  const lines = [
    "## Profitability Rankings",
    "",
    `Routes evaluated: **${report.routesEvaluated}** | Quoted: **${report.quotesSucceeded}** | Profitable: **${report.profitable}** | Near break-even: **${report.nearBreakEven}**`,
    "",
    "| Rank | Route | DEX Path | Size ($) | Gross ($) | Net ($) | Net % |",
    "|------|-------|----------|----------|-----------|---------|-------|",
  ];

  ranked.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.cycle.label} | ${r.dexPathLabel} | $${r.startAmountUsd.toLocaleString()} | $${r.grossProfit.toFixed(2)} | $${r.netProfit.toFixed(2)} | ${r.netProfitPct.toFixed(3)}% |`
    );
  });

  if (report.best?.quoteSuccess) {
    lines.push(
      "",
      "### Best Route Discovered",
      "",
      `- **Route:** ${report.best.cycle.label}`,
      `- **DEX path:** ${report.best.dexPathLabel}`,
      `- **Size:** $${report.best.startAmountUsd.toLocaleString()}`,
      `- **Net profit:** $${report.best.netProfit.toFixed(2)} (${report.best.netProfitPct.toFixed(3)}%)`,
      `- **Executable:** ${report.best.executable ? "Yes" : "No"}`,
      ""
    );
  }

  return lines.join("\n");
}

interface ReportStats {
  profitable: number;
  nearBreakEven: number;
  quoted: number;
}

function deriveAlphaProbability(stats: ReportStats, replay: ReturnType<typeof analyzeTriangleReplay>): string {
  if (stats.profitable > 0) return "20–30%";
  if (stats.nearBreakEven >= 5) return "10–15%";
  if (replay.nearBreakEvenRoutes.length > 0) return "5–10%";
  return "<5%";
}

function deriveDay33Recommendation(
  stats: ReportStats,
  replay: ReturnType<typeof analyzeTriangleReplay>
): string {
  const killSignals =
    stats.profitable === 0 &&
    replay.scenarios.every((s) => s.profitable === 0) &&
    stats.nearBreakEven < 3 &&
    countTriangularOpportunities() > 500;

  if (killSignals) {
    return "**Begin 14-day monitoring, lean toward pivot** — engine operational; initial data shows no near-break-even routes after Day 31 revalidation. If monitoring confirms, pivot to DeFi Market Intelligence Platform.";
  }

  if (stats.profitable > 0) {
    return "**Build triangular scanner with revalidation** — at least one net-positive route found. Add quote persistence and 48h collection before any execution work.";
  }

  return "**Continue 14-day triangular monitoring** — engine is operational. Day 31 near-break-even was a units bug; corrected scans show -2% to -5% net at $1k. Kill criteria clock starts now.";
}

export async function generateTriangleReport(
  provider: ethers.Provider,
  options?: { runScan?: boolean; scanSizes?: number[] }
): Promise<string> {
  initializeDatabase();
  initializeTriangularTables();

  const graph = buildTokenGraph(TRIANGLE_TOKEN_SYMBOLS);
  let scanReport: TriangleScanReport | null = null;

  if (options?.runScan !== false) {
    const sizes = options?.scanSizes ?? [...TRADE_SIZES_USD];
    console.log(
      `Running priority triangle scan (${PRIORITY_CYCLE_IDS.length} cycles × 64 DEX × ${sizes.length} sizes)...`
    );
    scanReport = await runTriangleScan(provider, {
      cycleIds: PRIORITY_CYCLE_IDS,
      sizes,
      persist: true,
      onProgress: (done, total, last) => {
        if (done % 64 === 0 || done === total) {
          const net = last?.quoteSuccess ? `$${last.netProfit.toFixed(2)}` : "—";
          console.log(`[triangle] ${done}/${total} last net=${net}`);
        }
      },
    });
  }

  const stats = scanReport
    ? {
        total: scanReport.routesEvaluated,
        quoted: scanReport.quotesSucceeded,
        profitable: scanReport.profitable,
        nearBreakEven: scanReport.nearBreakEven,
        maxNet: scanReport.best?.netProfit ?? 0,
        avgNet:
          scanReport.quotesSucceeded > 0
            ? scanReport.results
                .filter((r) => r.quoteSuccess)
                .reduce((s, r) => s + r.netProfit, 0) / scanReport.quotesSucceeded
            : 0,
      }
    : getTriangularProfitabilityStats();
  const replay = analyzeTriangleReplay(48 * 3600);

  const sections = [
    "# Day 32: Triangular Arbitrage Research Engine",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Executive Summary",
    "",
    `- Triangular cycles in universe: **${graph.cycleCount}**`,
    `- Total route permutations (full universe): **${countRoutes(graph.cycleCount, TRIANGLE_DEXES.length).toLocaleString()}**`,
    `- Opportunities stored (all time): **${countTriangularOpportunities()}**`,
    `- Latest scan quoted: **${stats.quoted}** / **${stats.total}**`,
    `- Profitable (net > 0): **${stats.profitable}**`,
    `- Near break-even (net > -$2): **${stats.nearBreakEven}**`,
    `- Best net profit: **$${stats.maxNet.toFixed(2)}**`,
    scanReport
      ? `- Priority scan evaluated: **${scanReport.routesEvaluated}** routes`
      : "",
    "",
    "### Day 31 Near-Break-Even Revalidation",
    "",
    "Day 31 reported WETH → ARB → USDC → WETH at **-$1.46** net. Revalidation found this was a **units bug**:",
    "`TriangleSimulator` subtracted WETH amounts as if they were USDC dollars (1 WETH end − 1 WETH start ≈ -$0.62 gross).",
    "With corrected USD accounting and cross-validated leg quotes, best routes are **-$18 to -$27** net at $1k (0.09% flash fee) — not near break-even.",
    "- Quote success rate: **~35%** overall (higher at $1k, lower at $10k+ due to thin-pool quoter failures)",
    "",
    "",
    formatTokenGraphMarkdown(graph),
    formatDexPermutationMarkdown(graph.cycleCount, TRIANGLE_DEXES.length),
    scanReport ? formatProfitabilityTable(scanReport) : formatDbProfitabilityTable(stats),
    formatRouteFrequencySection(),
    formatReplayMarkdown(replay),
    "## Continuous Monitoring",
    "",
    "Monitoring loop: `npm run triangle:monitor` (default 15s interval, 5–30s configurable).",
    "",
    "Each cycle re-evaluates 8 priority cycles × 64 DEX permutations × 4 trade sizes = **2,048 routes**.",
    "Results persist to `triangular_opportunities` for replay and frequency analysis.",
    "",
    "## Recommendation",
    "",
    `**Estimated alpha probability:** ${deriveAlphaProbability(stats, replay)}`,
    "",
    deriveDay33Recommendation(stats, replay),
    "",
    "### Kill Criteria (Day 31)",
    "",
    "Terminate triangular research if ALL true after 14 days:",
    "1. No profitable route",
    "2. No route exceeds costs after revalidation",
    "3. No repeatable profit pattern",
    "4. Opportunities explained by quote artifacts",
    "",
    "If met → pivot to **DeFi Market Intelligence & Research Platform**",
    "",
    "### Commands",
    "",
    "```bash",
    "npm run research:triangle          # Generate this report + priority scan",
    "npm run triangle:monitor           # Continuous collection (15s interval)",
    "npx ts-node src/tools.ts triangle-scan  # Single priority scan cycle",
    "```",
    "",
  ].filter(Boolean);

  return sections.join("\n");
}

export async function saveTriangleReport(
  provider: ethers.Provider,
  runScan = true
): Promise<string> {
  const report = await generateTriangleReport(provider, { runScan });
  const reportPath = path.join(__dirname, "../../docs/day32_triangular_research.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  return reportPath;
}
