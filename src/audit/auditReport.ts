import fs from "fs";
import path from "path";
import { StoredOpportunity } from "../database/database";
import { AuditedOpportunity } from "./opportunityAuditor";
import { QUOTE_DELAY_MS } from "./quoteConsistency";

export interface AuditReportData {
  generatedAt: string;
  totalOpportunities: number;
  profitableOpportunities: number;
  uniqueRoutesAudited: number;
  confirmedCount: number;
  partialCount: number;
  falsePositiveCount: number;
  falsePositivePercent: number;
  survivalRateAt0ms: number;
  survivalRateAt500ms: number;
  survivalRateAt1000ms: number;
  survivalRateAt2000ms: number;
  actuallyExecutableCount: number;
  notExecutableCount: number;
  avgSlippageLoss: number;
  avgDecayPercent: number;
  tokenRankings: Array<{
    token: string;
    count: number;
    confirmed: number;
    falsePositive: number;
    executable: number;
    avgOriginalProfit: number;
    avgRevalidatedProfit: number;
  }>;
  routeRankings: Array<{
    route: string;
    count: number;
    confirmed: number;
    falsePositive: number;
    executable: number;
    avgOriginalProfit: number;
    avgRevalidatedProfit: number;
  }>;
  failureReasons: Array<{ reason: string; count: number }>;
  conclusions: {
    opportunitiesReal: boolean;
    falsePositivePercent: number;
    revalidationSurvivalPercent: number;
    mostReliableToken: string;
    mostReliableRoute: string;
    strategyViable: boolean;
    improvements: string[];
  };
}

function groupRankings(
  audited: AuditedOpportunity[],
  key: "token" | "route"
) {
  const map = new Map<
    string,
    {
      count: number;
      confirmed: number;
      falsePositive: number;
      executable: number;
      originalSum: number;
      revalidatedSum: number;
    }
  >();

  for (const row of audited) {
    const k = row.opportunity[key];
    const existing = map.get(k) || {
      count: 0,
      confirmed: 0,
      falsePositive: 0,
      executable: 0,
      originalSum: 0,
      revalidatedSum: 0,
    };

    map.set(k, {
      count: existing.count + 1,
      confirmed: existing.confirmed + (row.reality.validationStatus === "CONFIRMED" ? 1 : 0),
      falsePositive:
        existing.falsePositive + (row.reality.validationStatus === "FALSE_POSITIVE" ? 1 : 0),
      executable: existing.executable + (row.reality.executable ? 1 : 0),
      originalSum: existing.originalSum + row.reality.profitOriginal,
      revalidatedSum: existing.revalidatedSum + row.reality.profitRevalidated,
    });
  }

  return [...map.entries()]
    .map(([name, data]) => ({
      [key]: name,
      count: data.count,
      confirmed: data.confirmed,
      falsePositive: data.falsePositive,
      executable: data.executable,
      avgOriginalProfit: Number((data.originalSum / data.count).toFixed(4)),
      avgRevalidatedProfit: Number((data.revalidatedSum / data.count).toFixed(4)),
    }))
    .sort((a, b) => b.confirmed - a.confirmed || b.executable - a.executable);
}

function survivalRate(audited: AuditedOpportunity[], delayMs: number): number {
  if (audited.length === 0) return 0;
  const surviving = audited.filter((row) => {
    const snap = row.snapshots.find((s) => s.delayMs === delayMs);
    return snap?.stillProfitable ?? false;
  }).length;
  return Number(((surviving / audited.length) * 100).toFixed(2));
}

export function buildAuditReport(
  allOpportunities: StoredOpportunity[],
  audited: AuditedOpportunity[]
): AuditReportData {
  const confirmedCount = audited.filter((a) => a.reality.validationStatus === "CONFIRMED").length;
  const partialCount = audited.filter((a) => a.reality.validationStatus === "PARTIAL").length;
  const falsePositiveCount = audited.filter(
    (a) => a.reality.validationStatus === "FALSE_POSITIVE"
  ).length;
  const actuallyExecutableCount = audited.filter((a) => a.reality.executable).length;

  const uniqueKeys = new Set(
    audited.map((a) => `${a.opportunity.token}|${a.opportunity.route}|${a.opportunity.size}`)
  );

  const failureMap = new Map<string, number>();
  for (const row of audited) {
    if (row.reality.failureReason) {
      failureMap.set(
        row.reality.failureReason,
        (failureMap.get(row.reality.failureReason) ?? 0) + 1
      );
    }
  }

  const tokenRankings = groupRankings(audited, "token") as AuditReportData["tokenRankings"];
  const routeRankings = groupRankings(audited, "route") as AuditReportData["routeRankings"];

  const avgSlippageLoss =
    audited.length > 0
      ? Number(
          (audited.reduce((sum, a) => sum + a.slippage.slippageLoss, 0) / audited.length).toFixed(4)
        )
      : 0;

  const avgDecayPercent =
    audited.length > 0
      ? Number(
          (audited.reduce((sum, a) => sum + a.reality.decayPercent, 0) / audited.length).toFixed(2)
        )
      : 0;

  const falsePositivePercent =
    audited.length > 0
      ? Number(((falsePositiveCount / audited.length) * 100).toFixed(2))
      : 0;

  const revalidationSurvivalPercent = survivalRate(audited, 0);

  const mostReliableToken =
    tokenRankings.find((t) => t.confirmed > 0)?.token ??
    tokenRankings.sort((a, b) => b.avgRevalidatedProfit - a.avgRevalidatedProfit)[0]?.token ??
    "N/A";

  const mostReliableRoute =
    routeRankings.find((r) => r.confirmed > 0)?.route ??
    routeRankings.sort((a, b) => b.avgRevalidatedProfit - a.avgRevalidatedProfit)[0]?.route ??
    "N/A";

  const strategyViable = actuallyExecutableCount > 0;

  const improvements: string[] = [];
  if (falsePositivePercent > 50) {
    improvements.push("Fix quote pipeline mismatches causing false positives");
  }
  if (survivalRate(audited, 2000) < 10) {
    improvements.push("Opportunities decay within 2s — improve scan-to-execution latency or filter stale quotes");
  }
  if (avgSlippageLoss > 1) {
    improvements.push("Incorporate pool-reserve slippage model into scanner profit calculation");
  }
  if (actuallyExecutableCount === 0) {
    improvements.push("Raise MIN_NET_PROFIT threshold or restrict to routes that survive revalidation");
    improvements.push("Investigate ARB $100 SUSHI->UNISWAP recurring phantom spreads");
  }
  if (improvements.length === 0) {
    improvements.push("Continue live monitoring and narrow to confirmed executable routes");
  }

  return {
    generatedAt: new Date().toISOString(),
    totalOpportunities: allOpportunities.length,
    profitableOpportunities: audited.length,
    uniqueRoutesAudited: uniqueKeys.size,
    confirmedCount,
    partialCount,
    falsePositiveCount,
    falsePositivePercent,
    survivalRateAt0ms: survivalRate(audited, 0),
    survivalRateAt500ms: survivalRate(audited, 500),
    survivalRateAt1000ms: survivalRate(audited, 1000),
    survivalRateAt2000ms: survivalRate(audited, 2000),
    actuallyExecutableCount,
    notExecutableCount: audited.length - actuallyExecutableCount,
    avgSlippageLoss,
    avgDecayPercent,
    tokenRankings: tokenRankings.map((t) => ({
      token: t.token,
      count: t.count,
      confirmed: t.confirmed,
      falsePositive: t.falsePositive,
      executable: t.executable,
      avgOriginalProfit: t.avgOriginalProfit,
      avgRevalidatedProfit: t.avgRevalidatedProfit,
    })),
    routeRankings: routeRankings.map((r) => ({
      route: r.route,
      count: r.count,
      confirmed: r.confirmed,
      falsePositive: r.falsePositive,
      executable: r.executable,
      avgOriginalProfit: r.avgOriginalProfit,
      avgRevalidatedProfit: r.avgRevalidatedProfit,
    })),
    failureReasons: [...failureMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    conclusions: {
      opportunitiesReal: confirmedCount + partialCount > falsePositiveCount,
      falsePositivePercent,
      revalidationSurvivalPercent,
      mostReliableToken,
      mostReliableRoute,
      strategyViable,
      improvements,
    },
  };
}

function fmtProfit(value: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `$${value.toFixed(4)}`;
}

function sanitizeReason(reason: string): string {
  if (reason.length <= 80) return reason;
  if (reason.includes("CALL_EXCEPTION")) return "pool call reverted";
  return `${reason.slice(0, 77)}...`;
}

function renderMarkdown(data: AuditReportData): string {
  let md = "# Day 25.5: Scanner Audit Report\n\n";

  md += "## Executive Summary\n\n";
  md += `**Generated:** ${data.generatedAt}\n\n`;
  md += `This audit re-fetched buy/sell quotes for every profitable opportunity stored in SQLite, `;
  md += `measuring quote consistency at ${QUOTE_DELAY_MS.join("ms, ")}ms intervals, `;
  md += `classifying false positives, and checking execution feasibility with gas, flash fees, and slippage buffers.\n\n`;

  const verdict = data.conclusions.strategyViable
    ? "Some opportunities may be executable after revalidation."
    : "No opportunities passed the execution reality check — detected spreads are likely scanner artifacts or too ephemeral.";

  md += `**Verdict:** ${verdict}\n\n`;

  md += "## Opportunity Statistics\n\n";
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Profitable opportunities audited | ${data.profitableOpportunities} |\n`;
  md += `| Unique routes revalidated | ${data.uniqueRoutesAudited} |\n`;
  md += `| CONFIRMED | ${data.confirmedCount} |\n`;
  md += `| PARTIAL | ${data.partialCount} |\n`;
  md += `| FALSE_POSITIVE | ${data.falsePositiveCount} (${data.falsePositivePercent}%) |\n`;
  md += `| ACTUALLY_EXECUTABLE | ${data.actuallyExecutableCount} |\n`;
  md += `| NOT_EXECUTABLE | ${data.notExecutableCount} |\n\n`;

  md += "## Quote Consistency Results\n\n";
  md += `| Delay | Still Profitable |\n|-------|------------------|\n`;
  md += `| 0ms | ${data.survivalRateAt0ms}% |\n`;
  md += `| 500ms | ${data.survivalRateAt500ms}% |\n`;
  md += `| 1000ms | ${data.survivalRateAt1000ms}% |\n`;
  md += `| 2000ms | ${data.survivalRateAt2000ms}% |\n\n`;
  md += `Average profit decay at t=0: ${data.avgDecayPercent}%\n\n`;

  md += "## False Positive Analysis\n\n";
  md += `- **False positive rate:** ${data.falsePositivePercent}%\n`;
  md += `- **Survive immediate revalidation (t=0):** ${data.conclusions.revalidationSurvivalPercent}%\n\n`;
  md += `Classification rules:\n`;
  md += `- **CONFIRMED** — revalidated profit ≥ original scanner profit\n`;
  md += `- **PARTIAL** — revalidated profit > 0 but below original\n`;
  md += `- **FALSE_POSITIVE** — revalidated profit ≤ 0\n\n`;

  md += "## Slippage Analysis\n\n";
  md += `Average slippage loss (scanner profit − realistic pool-based profit): **$${data.avgSlippageLoss}**\n\n`;
  md += `Realistic profit uses pool reserves, swap fees, gas, and flash loan fees.\n\n`;

  md += "## Execution Feasibility\n\n";
  md += `| Status | Count |\n|--------|-------|\n`;
  md += `| ACTUALLY_EXECUTABLE | ${data.actuallyExecutableCount} |\n`;
  md += `| NOT_EXECUTABLE | ${data.notExecutableCount} |\n\n`;

  if (data.failureReasons.length > 0) {
    md += `### Failure Reasons\n\n`;
    md += `| Reason | Count |\n|--------|-------|\n`;
    for (const row of data.failureReasons) {
      md += `| ${sanitizeReason(row.reason)} | ${row.count} |\n`;
    }
    md += "\n";
  }

  md += "## Route Rankings\n\n";
  md += `| Route | Count | Confirmed | False Positive | Executable | Avg Original | Avg Revalidated |\n`;
  md += `|-------|-------|-----------|----------------|------------|--------------|----------------|\n`;
  for (const r of data.routeRankings) {
    md += `| ${r.route} | ${r.count} | ${r.confirmed} | ${r.falsePositive} | ${r.executable} | ${fmtProfit(r.avgOriginalProfit)} | ${fmtProfit(r.avgRevalidatedProfit)} |\n`;
  }
  md += "\n";

  md += "## Token Rankings\n\n";
  md += `| Token | Count | Confirmed | False Positive | Executable | Avg Original | Avg Revalidated |\n`;
  md += `|-------|-------|-----------|----------------|------------|--------------|----------------|\n`;
  for (const t of data.tokenRankings) {
    md += `| ${t.token} | ${t.count} | ${t.confirmed} | ${t.falsePositive} | ${t.executable} | ${fmtProfit(t.avgOriginalProfit)} | ${fmtProfit(t.avgRevalidatedProfit)} |\n`;
  }
  md += "\n";

  md += "## Recommendations\n\n";
  data.conclusions.improvements.forEach((item, index) => {
    md += `${index + 1}. ${item}\n`;
  });
  md += "\n";

  md += "## Final Conclusions\n\n";
  md += `1. **Are profitable opportunities real?** ${data.conclusions.opportunitiesReal ? "Partially — some survive revalidation" : "No — most collapse on immediate re-quote"}\n`;
  md += `2. **What percentage are false positives?** ${data.falsePositivePercent}%\n`;
  md += `3. **What percentage survive revalidation?** ${data.conclusions.revalidationSurvivalPercent}% at t=0ms\n`;
  md += `4. **Most reliable token pair:** ${data.conclusions.mostReliableToken}\n`;
  md += `5. **Most reliable route:** ${data.conclusions.mostReliableRoute}\n`;
  md += `6. **Is the current strategy viable?** ${data.conclusions.strategyViable ? "Possibly, for confirmed executable routes only" : "No — not economically viable with current detection pipeline"}\n`;
  md += `7. **What should be improved next?**\n`;
  for (const item of data.conclusions.improvements) {
    md += `   - ${item}\n`;
  }
  md += "\n";

  return md;
}

export function saveAuditReport(data: AuditReportData): string {
  const reportPath = path.join(__dirname, "../../docs/day25_scanner_audit.md");
  fs.writeFileSync(reportPath, renderMarkdown(data), "utf-8");
  return reportPath;
}
