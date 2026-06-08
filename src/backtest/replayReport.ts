import fs from "fs";
import path from "path";
import { ReplayReportData, ReplayReportPath } from "./types";

const DEFAULT_REPORT_PATH = path.join(process.cwd(), "docs", "day21_replay_analysis.md");

export function renderReplayReport(data: ReplayReportData): string {
  let md = "";

  md += "# Opportunity Replay Report\n\n";
  md += "## Overview\n\n";
  md += `**Generated:** ${data.generatedAt}\n\n`;
  md += `**Replay window:** last ${data.replayWindowSeconds} seconds\n\n`;
  md += `**Opportunities analyzed:** ${data.recentOpportunities}\n\n`;
  md += `**Total replay rows:** ${data.totalReplays} (opportunity × delay)\n\n`;

  md += "## Survival Statistics\n\n";
  md += `| Delay | Total | Still Profitable | Executable | Marginal | Dead | Survival Rate | Avg Current Profit |\n`;
  md += `|------|-------|------------------|-----------|----------|------|---------------|--------------------|\n`;
  for (const row of data.delayStats) {
    md += `| ${row.delaySeconds}s | ${row.total} | ${row.stillProfitable} | ${row.executableCount} | ${row.marginalCount} | ${row.deadCount} | ${row.survivalRate.toFixed(2)}% | $${row.averageCurrentProfit.toFixed(2)} |\n`;
  }
  md += "\n";

  md += "## Route Rankings\n\n";
  md += `| Rank | Route | Total | Survival Rate | Executable | Marginal | Dead |\n`;
  md += `|------|-------|-------|---------------|-----------|----------|------|\n`;
  for (let i = 0; i < Math.min(10, data.routeStats.length); i++) {
    const route = data.routeStats[i]!;
    md += `| ${i + 1} | ${route.route} | ${route.total} | ${route.survivalRate.toFixed(2)}% | ${route.executableCount} | ${route.marginalCount} | ${route.deadCount} |\n`;
  }
  md += "\n";

  md += "## Token Rankings\n\n";
  md += `| Rank | Token | Total | Survival Rate | Executable | Marginal | Dead |\n`;
  md += `|------|-------|-------|---------------|-----------|----------|------|\n`;
  for (let i = 0; i < Math.min(10, data.tokenStats.length); i++) {
    const token = data.tokenStats[i]!;
    md += `| ${i + 1} | ${token.token} | ${token.total} | ${token.survivalRate.toFixed(2)}% | ${token.executableCount} | ${token.marginalCount} | ${token.deadCount} |\n`;
  }
  md += "\n";

  md += "## Execution Feasibility\n\n";
  md += `The report simulates a delayed execution model for historical profitable opportunities using current quotes plus a delay slippage penalty. The snapshots show how many trades remain profitable after each delay interval.\n\n`;

  md += "## Longest Surviving Opportunities\n\n";
  md += `| Rank | Token | Route | Size | Original Profit | Survived Delays | Max Delay With Profit | Current Profit at Max Delay | Classification | Reason |\n`;
  md += `|------|-------|-------|------|----------------|-----------------|------------------------|-----------------------------|----------------|--------|\n`;
  for (let i = 0; i < Math.min(10, data.topSurvivors.length); i++) {
    const opp = data.topSurvivors[i]!;
    md += `| ${i + 1} | ${opp.token} | ${opp.route} | $${opp.size} | $${opp.originalProfit.toFixed(2)} | ${opp.survivedDelays} | ${opp.maxDelayWithProfit}s | $${opp.currentProfitAtMaxDelay.toFixed(2)} | ${opp.classificationAtMaxDelay} | ${opp.reasonAtMaxDelay} |\n`;
  }
  md += "\n";

  md += "## Conclusions\n\n";
  const fiveSec = data.delayStats.find((row) => row.delaySeconds === 5);
  const maxDelay = data.delayStats[data.delayStats.length - 1];
  const survivalAtMax = maxDelay?.survivalRate ?? 0;

  md += `- Opportunity replay uses a realistic delay model and current quotes to estimate execution viability.\n`;
  md += `- After 5 seconds, ${fiveSec?.survivalRate.toFixed(2) ?? "0.00"}% of replayed opportunities remain profitable.\n`;
  md += `- After ${maxDelay?.delaySeconds}s, ${survivalAtMax.toFixed(2)}% remain profitable.\n`;

  if (survivalAtMax >= 50) {
    md += `- Recommendation: A flash-loan execution engine is likely justified for this universe of opportunities.\n`;
  } else if (survivalAtMax >= 20) {
    md += `- Recommendation: Execution may be viable with strong optimization, but the opportunity window is narrow.\n`;
  } else {
    md += `- Recommendation: Market persistence is low; focus on broader scanning or improved execution assumptions before building flash-loan infrastructure.\n`;
  }

  return md;
}

export function saveReplayReport(
  data: ReplayReportData,
  filePath = DEFAULT_REPORT_PATH
): ReplayReportPath {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const markdown = renderReplayReport(data);
  fs.writeFileSync(filePath, markdown, { encoding: "utf8" });
  return filePath;
}
