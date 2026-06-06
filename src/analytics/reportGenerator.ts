import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { StoredOpportunity } from "../database/database";

const dbPath = path.join(__dirname, "../../arbitrage.db");
const db = new Database(dbPath);

export interface ReportData {
  generatedAt: string;
  dataCollectionStart: number;
  dataCollectionEnd: number;
  durationHours: number;
  totalOpportunities: number;
  profitableOpportunities: number;
  profitPercentage: number;
  totalProfit: number;
  averageProfit: number;
  maxProfit: number;
  minProfit: number;
  tokens: TokenStats[];
  routes: RouteStats[];
  sizes: SizeStats[];
  dexes: DexStats[];
  lifetimes: OpportunityLifetime[];
}

export interface TokenStats {
  token: string;
  count: number;
  profitableCount: number;
  profitPercentage: number;
  totalProfit: number;
  averageProfit: number;
  maxProfit: number;
}

export interface RouteStats {
  route: string;
  count: number;
  profitableCount: number;
  profitPercentage: number;
  totalProfit: number;
  averageProfit: number;
  maxProfit: number;
}

export interface SizeStats {
  size: number;
  count: number;
  profitableCount: number;
  profitPercentage: number;
  totalProfit: number;
  averageProfit: number;
}

export interface DexStats {
  dex: string;
  count: number;
  profitableCount: number;
  profitPercentage: number;
  totalProfit: number;
  averageProfit: number;
}

export interface OpportunityLifetime {
  token: string;
  route: string;
  size: number;
  occurrences: number;
  avgDuration: number;
  instances: number;
}

function getAllOpportunities(): StoredOpportunity[] {
  const stmt = db.prepare("SELECT * FROM opportunities ORDER BY timestamp ASC");
  return stmt.all() as StoredOpportunity[];
}

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function calculateTokenStats(opportunities: StoredOpportunity[]): TokenStats[] {
  const tokenMap = new Map<
    string,
    {
      count: number;
      profitableCount: number;
      totalProfit: number;
      profits: number[];
    }
  >();

  for (const opp of opportunities) {
    const existing = tokenMap.get(opp.token) || {
      count: 0,
      profitableCount: 0,
      totalProfit: 0,
      profits: [],
    };
    tokenMap.set(opp.token, {
      count: existing.count + 1,
      profitableCount:
        existing.profitableCount + (opp.net_profit > 0 ? 1 : 0),
      totalProfit: existing.totalProfit + opp.net_profit,
      profits: [...existing.profits, opp.net_profit],
    });
  }

  const results: TokenStats[] = [];
  for (const [token, data] of tokenMap.entries()) {
    results.push({
      token,
      count: data.count,
      profitableCount: data.profitableCount,
      profitPercentage: Number(
        ((data.profitableCount / data.count) * 100).toFixed(2)
      ),
      totalProfit: Number(data.totalProfit.toFixed(2)),
      averageProfit: Number(
        (data.totalProfit / data.count).toFixed(2)
      ),
      maxProfit: Number(Math.max(...data.profits).toFixed(2)),
    });
  }

  return results.sort((a, b) => b.totalProfit - a.totalProfit);
}

function calculateRouteStats(opportunities: StoredOpportunity[]): RouteStats[] {
  const routeMap = new Map<
    string,
    {
      count: number;
      profitableCount: number;
      totalProfit: number;
      profits: number[];
    }
  >();

  for (const opp of opportunities) {
    const existing = routeMap.get(opp.route) || {
      count: 0,
      profitableCount: 0,
      totalProfit: 0,
      profits: [],
    };
    routeMap.set(opp.route, {
      count: existing.count + 1,
      profitableCount:
        existing.profitableCount + (opp.net_profit > 0 ? 1 : 0),
      totalProfit: existing.totalProfit + opp.net_profit,
      profits: [...existing.profits, opp.net_profit],
    });
  }

  const results: RouteStats[] = [];
  for (const [route, data] of routeMap.entries()) {
    results.push({
      route,
      count: data.count,
      profitableCount: data.profitableCount,
      profitPercentage: Number(
        ((data.profitableCount / data.count) * 100).toFixed(2)
      ),
      totalProfit: Number(data.totalProfit.toFixed(2)),
      averageProfit: Number(
        (data.totalProfit / data.count).toFixed(2)
      ),
      maxProfit: Number(Math.max(...data.profits).toFixed(2)),
    });
  }

  return results.sort((a, b) => b.totalProfit - a.totalProfit);
}

function calculateSizeStats(opportunities: StoredOpportunity[]): SizeStats[] {
  const sizeMap = new Map<
    number,
    {
      count: number;
      profitableCount: number;
      totalProfit: number;
      profits: number[];
    }
  >();

  for (const opp of opportunities) {
    const size = opp.size;
    const existing = sizeMap.get(size) || {
      count: 0,
      profitableCount: 0,
      totalProfit: 0,
      profits: [],
    };
    sizeMap.set(size, {
      count: existing.count + 1,
      profitableCount:
        existing.profitableCount + (opp.net_profit > 0 ? 1 : 0),
      totalProfit: existing.totalProfit + opp.net_profit,
      profits: [...existing.profits, opp.net_profit],
    });
  }

  const results: SizeStats[] = [];
  for (const [size, data] of sizeMap.entries()) {
    results.push({
      size,
      count: data.count,
      profitableCount: data.profitableCount,
      profitPercentage: Number(
        ((data.profitableCount / data.count) * 100).toFixed(2)
      ),
      totalProfit: Number(data.totalProfit.toFixed(2)),
      averageProfit: Number(
        (data.totalProfit / data.count).toFixed(2)
      ),
    });
  }

  return results.sort((a, b) => a.size - b.size);
}

function calculateDexStats(opportunities: StoredOpportunity[]): DexStats[] {
  const dexMap = new Map<
    string,
    {
      count: number;
      profitableCount: number;
      totalProfit: number;
      profits: number[];
    }
  >();

  for (const opp of opportunities) {
    for (const dex of [opp.dex_buy, opp.dex_sell]) {
      const existing = dexMap.get(dex) || {
        count: 0,
        profitableCount: 0,
        totalProfit: 0,
        profits: [],
      };
      dexMap.set(dex, {
        count: existing.count + 1,
        profitableCount:
          existing.profitableCount + (opp.net_profit > 0 ? 1 : 0),
        totalProfit: existing.totalProfit + opp.net_profit,
        profits: [...existing.profits, opp.net_profit],
      });
    }
  }

  const results: DexStats[] = [];
  for (const [dex, data] of dexMap.entries()) {
    results.push({
      dex,
      count: data.count,
      profitableCount: data.profitableCount,
      profitPercentage: Number(
        ((data.profitableCount / data.count) * 100).toFixed(2)
      ),
      totalProfit: Number(data.totalProfit.toFixed(2)),
      averageProfit: Number(
        (data.totalProfit / data.count).toFixed(2)
      ),
    });
  }

  return results.sort((a, b) => b.totalProfit - a.totalProfit);
}

function calculateOpportunityLifetimes(
  opportunities: StoredOpportunity[]
): OpportunityLifetime[] {
  const lifetimeMap = new Map<
    string,
    {
      timestamps: number[];
      occurrences: number;
    }
  >();

  // Group by token+route+size
  for (const opp of opportunities) {
    const key = `${opp.token}|${opp.route}|${opp.size}`;
    const existing = lifetimeMap.get(key) || {
      timestamps: [],
      occurrences: 0,
    };
    lifetimeMap.set(key, {
      timestamps: [...existing.timestamps, opp.timestamp],
      occurrences: existing.occurrences + 1,
    });
  }

  const results: OpportunityLifetime[] = [];

  for (const [key, data] of lifetimeMap.entries()) {
    const parts = key.split("|");
    const token = parts[0]!;
    const route = parts[1]!;
    const sizeStr = parts[2];
    const size = sizeStr ? parseFloat(sizeStr) : 0;

    // Sort timestamps
    const timestamps = data.timestamps.sort((a, b) => a - b);

    // Calculate durations between instances (30-second gap threshold)
    let instances = 1;
    let totalDuration = 0;
    let sequenceStart = timestamps[0]!;

    for (let i = 1; i < timestamps.length; i++) {
      const timeDiff = timestamps[i]! - timestamps[i - 1]!;
      if (timeDiff > 30) {
        totalDuration += timestamps[i - 1]! - sequenceStart;
        sequenceStart = timestamps[i]!;
        instances++;
      }
    }
    totalDuration += timestamps[timestamps.length - 1]! - sequenceStart;

    results.push({
      token,
      route,
      size,
      occurrences: data.occurrences,
      avgDuration: Number((totalDuration / instances).toFixed(1)),
      instances,
    });
  }

  // Sort by average duration (longest first)
  return results.sort((a, b) => b.avgDuration - a.avgDuration);
}

export function generateReport(): ReportData {
  const opportunities = getAllOpportunities();

  if (opportunities.length === 0) {
    throw new Error("No opportunities found in database. Run monitor first.");
  }

  const startTimestamp = opportunities[0]!.timestamp;
  const endTimestamp = opportunities[opportunities.length - 1]!.timestamp;
  const durationSeconds = endTimestamp - startTimestamp;
  const durationHours = Number((durationSeconds / 3600).toFixed(2));

  const profitable = opportunities.filter((o) => o.net_profit > 0);
  const totalProfit = opportunities.reduce((sum, o) => sum + o.net_profit, 0);
  const profitValues = opportunities.map((o) => o.net_profit);

  return {
    generatedAt: new Date().toISOString(),
    dataCollectionStart: startTimestamp,
    dataCollectionEnd: endTimestamp,
    durationHours,
    totalOpportunities: opportunities.length,
    profitableOpportunities: profitable.length,
    profitPercentage: Number(
      ((profitable.length / opportunities.length) * 100).toFixed(2)
    ),
    totalProfit: Number(totalProfit.toFixed(2)),
    averageProfit: Number((totalProfit / opportunities.length).toFixed(2)),
    maxProfit: Number(Math.max(...profitValues).toFixed(2)),
    minProfit: Number(Math.min(...profitValues).toFixed(2)),
    tokens: calculateTokenStats(opportunities),
    routes: calculateRouteStats(opportunities),
    sizes: calculateSizeStats(opportunities),
    dexes: calculateDexStats(opportunities),
    lifetimes: calculateOpportunityLifetimes(opportunities),
  };
}

function renderReport(data: ReportData): string {
  let md = "";

  md += "# Day 14: Reality Validation Report\n\n";

  // Overview
  md += "## Overview\n\n";
  md += `**Generated:** ${data.generatedAt}\n\n`;
  md += `**Data Collection Period:** ${formatTimestamp(data.dataCollectionStart)} to ${formatTimestamp(data.dataCollectionEnd)}\n\n`;
  md += `**Duration:** ${data.durationHours} hours\n\n`;

  // Key Statistics
  md += "## Key Statistics\n\n";
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Scans | ${data.totalOpportunities} |\n`;
  md += `| Profitable Scans | ${data.profitableOpportunities} |\n`;
  md += `| Profitability Rate | ${data.profitPercentage}% |\n`;
  md += `| Total Profit | $${data.totalProfit} USDC |\n`;
  md += `| Average Profit | $${data.averageProfit} USDC |\n`;
  md += `| Max Profit | $${data.maxProfit} USDC |\n`;
  md += `| Min Profit | $${data.minProfit} USDC |\n\n`;

  // Token Ranking
  md += "## Token Ranking\n\n";
  md += `| Rank | Token | Scans | Profitable | Rate | Total Profit | Avg | Max |\n`;
  md += `|------|-------|-------|-----------|------|--------------|-----|-----|\n`;
  for (let i = 0; i < Math.min(10, data.tokens.length); i++) {
    const t = data.tokens[i]!;
    md += `| ${i + 1} | ${t.token} | ${t.count} | ${t.profitableCount} | ${t.profitPercentage}% | $${t.totalProfit} | $${t.averageProfit} | $${t.maxProfit} |\n`;
  }
  md += "\n";

  if (data.tokens.length > 0) {
    md += `**Best Token:** ${data.tokens[0]!.token} with $${data.tokens[0]!.totalProfit} profit\n\n`;
    md += `**Worst Token:** ${data.tokens[data.tokens.length - 1]!.token} with $${data.tokens[data.tokens.length - 1]!.totalProfit} profit\n\n`;
  }

  // Route Ranking
  md += "## Route Ranking\n\n";
  md += `| Rank | Route | Scans | Profitable | Rate | Total Profit | Avg | Max |\n`;
  md += `|------|-------|-------|-----------|------|--------------|-----|-----|\n`;
  for (let i = 0; i < Math.min(10, data.routes.length); i++) {
    const r = data.routes[i]!;
    md += `| ${i + 1} | ${r.route} | ${r.count} | ${r.profitableCount} | ${r.profitPercentage}% | $${r.totalProfit} | $${r.averageProfit} | $${r.maxProfit} |\n`;
  }
  md += "\n";

  if (data.routes.length > 0) {
    md += `**Best DEX Pair:** ${data.routes[0]!.route} with $${data.routes[0]!.totalProfit} profit\n\n`;
    md += `**Worst DEX Pair:** ${data.routes[data.routes.length - 1]!.route} with $${data.routes[data.routes.length - 1]!.totalProfit} profit\n\n`;
  }

  // Trade Size Ranking
  md += "## Trade Size Analysis\n\n";
  md += `| Size | Scans | Profitable | Rate | Total Profit | Avg Profit |\n`;
  md += `|------|-------|-----------|------|--------------|------------|\n`;
  for (const s of data.sizes) {
    md += `| $${s.size} | ${s.count} | ${s.profitableCount} | ${s.profitPercentage}% | $${s.totalProfit} | $${s.averageProfit} |\n`;
  }
  md += "\n";

  // Find best size
  if (data.sizes.length > 0) {
    const bestSize = data.sizes.reduce((a, b) =>
      a.averageProfit > b.averageProfit ? a : b
    );
    md += `**Optimal Trade Size:** $${bestSize.size} with average profit of $${bestSize.averageProfit}\n\n`;
  }

  // DEX Statistics
  md += "## DEX Performance\n\n";
  md += `| DEX | Usage Count | Profitable | Rate | Total Profit | Avg Profit |\n`;
  md += `|-----|-------------|-----------|------|--------------|------------|\n`;
  for (const d of data.dexes) {
    md += `| ${d.dex} | ${d.count} | ${d.profitableCount} | ${d.profitPercentage}% | $${d.totalProfit} | $${d.averageProfit} |\n`;
  }
  md += "\n";

  // Opportunity Lifetime Analysis
  md += "## Opportunity Lifetime Analysis\n\n";
  md += "The most critical metric: **How long do opportunities persist?**\n\n";
  md += `Top 10 longest-living opportunities:\n\n`;
  md += `| Token | Route | Size | Occurrences | Avg Duration | Instances |\n`;
  md += `|-------|-------|------|-------------|--------------|----------|\n`;
  for (let i = 0; i < Math.min(10, data.lifetimes.length); i++) {
    const l = data.lifetimes[i]!;
    md += `| ${l.token} | ${l.route} | $${l.size} | ${l.occurrences} | ${l.avgDuration}s | ${l.instances} |\n`;
  }
  md += "\n";

  // Lifetime summary
  if (data.lifetimes.length > 0) {
    const avgLifetime =
      data.lifetimes.reduce((sum, l) => sum + l.avgDuration, 0) /
      data.lifetimes.length;
    const maxLifetime = Math.max(...data.lifetimes.map((l) => l.avgDuration));
    const minLifetime = Math.min(...data.lifetimes.map((l) => l.avgDuration));

    md += `**Lifetime Summary:**\n`;
    md += `- Average opportunity duration: ${Number(avgLifetime.toFixed(1))} seconds\n`;
    md += `- Longest opportunity: ${maxLifetime} seconds\n`;
    md += `- Shortest opportunity: ${minLifetime} seconds\n\n`;
  }

  // Conclusions
  md += "## Conclusions & Recommendations\n\n";

  const profitRate = data.profitPercentage;
  const avgProfit = data.averageProfit;
  const avgLifetime =
    data.lifetimes.length > 0
      ? data.lifetimes.reduce((sum, l) => sum + l.avgDuration, 0) /
        data.lifetimes.length
      : 0;

  md += "### Opportunity Frequency\n\n";
  if (profitRate < 0.1) {
    md += `**Status:** ❌ Almost no profitable opportunities (${profitRate}%)\n`;
    md += `**Action:** Need to add more tokens or DEXes to the scanner.\n`;
  } else if (profitRate < 1) {
    md += `**Status:** ⚠️ Low profitability rate (${profitRate}%)\n`;
    md += `**Action:** Consider expanding token/DEX coverage or adjusting price discovery.\n`;
  } else if (profitRate < 5) {
    md += `**Status:** ✅ Moderate profitability rate (${profitRate}%)\n`;
    md += `**Action:** Good foundation for further optimization.\n`;
  } else {
    md += `**Status:** ✅✅ High profitability rate (${profitRate}%)\n`;
    md += `**Action:** Excellent data for production execution.\n`;
  }
  md += "\n";

  md += "### Opportunity Lifetime\n\n";
  if (avgLifetime < 1) {
    md += `**Status:** ⚠️⚠️ Very short windows (<1 second)\n`;
    md += `**Execution Requirement:** Sub-second latency required\n`;
    md += `**Feasibility:** Likely impossible for retail without specialized infrastructure.\n`;
  } else if (avgLifetime < 5) {
    md += `**Status:** ⚠️ Short windows (${Number(avgLifetime.toFixed(1))} seconds)\n`;
    md += `**Execution Requirement:** Fast execution (<${Math.round(avgLifetime / 2)}s) needed\n`;
    md += `**Feasibility:** Possible with optimized execution, but tight timing.\n`;
  } else if (avgLifetime < 30) {
    md += `**Status:** ✅ Moderate windows (${Number(avgLifetime.toFixed(1))} seconds)\n`;
    md += `**Execution Requirement:** Standard execution (<10s) is sufficient\n`;
    md += `**Feasibility:** Good for production implementation.\n`;
  } else {
    md += `**Status:** ✅✅ Long windows (${Number(avgLifetime.toFixed(1))} seconds)\n`;
    md += `**Execution Requirement:** Ample time for execution\n`;
    md += `**Feasibility:** Excellent conditions for retail trading.\n`;
  }
  md += "\n";

  md += "### Profit Metrics\n\n";
  md += `- Average profit per opportunity: $${avgProfit}\n`;
  md += `- Total profit in period: $${data.totalProfit}\n`;
  if (data.durationHours > 0) {
    const profitPerHour = data.totalProfit / data.durationHours;
    md += `- Profit per hour: $${Number(profitPerHour.toFixed(2))}\n`;
  }
  md += "\n";

  md += "### Next Steps\n\n";
  if (profitRate < 1 || avgLifetime < 1) {
    md += "1. **Expand Coverage:** Add more tokens or DEXes\n";
    md += "2. **Optimize Discovery:** Improve price discovery speed\n";
    md += "3. **Re-Run Analysis:** Collect new data after changes\n";
  } else if (profitRate < 5) {
    md += "1. **Optimize Execution:** Focus on reducing execution time\n";
    md += "2. **Refine Routes:** Identify best DEX pairs\n";
    md += "3. **Implement Execution:** Build transaction submission logic\n";
  } else {
    md += "1. **Build Execution Engine:** Implement trade submission\n";
    md += "2. **Risk Management:** Add position sizing and stop-loss\n";
    md += "3. **Go to Production:** Scale up execution\n";
  }
  md += "\n";

  return md;
}

export function saveReport(data: ReportData): void {
  const md = renderReport(data);
  const reportPath = path.join(__dirname, "../../docs/research_report_day14.md");
  fs.writeFileSync(reportPath, md, "utf-8");
  console.log(`\n✅ Report saved to: ${reportPath}\n`);
}

db.close();
