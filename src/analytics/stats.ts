import Database from "better-sqlite3";
import path from "path";
import { StoredOpportunity } from "../database/database";

const dbPath = path.join(__dirname, "../../arbitrage.db");
const db = new Database(dbPath);

export interface OpportunitiesStats {
  totalScans: number;
  profitableCount: number;
  profitablePercentage: number;
  averageProfit: number;
  maxProfit: number;
  minProfit: number;
  bestToken: string;
  bestRoute: string;
  worstRoute: string;
  topTokens: Array<{ token: string; profit: number; count: number }>;
  topRoutes: Array<{ route: string; profit: number; count: number }>;
  topDexes: Array<{ dex: string; profit: number; count: number }>;
  sizeAnalysis: Array<{
    size: number;
    count: number;
    avgProfit: number;
    profitableCount: number;
  }>;
}

/**
 * Get statistics for opportunities within a time window
 */
export function getStatsSince(secondsAgo: number): OpportunitiesStats {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - secondsAgo;

  // Get all opportunities in the time window
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE timestamp >= ?
  `);

  const opportunities = stmt.all(cutoffTimestamp) as StoredOpportunity[];

  if (opportunities.length === 0) {
    return {
      totalScans: 0,
      profitableCount: 0,
      profitablePercentage: 0,
      averageProfit: 0,
      maxProfit: 0,
      minProfit: 0,
      bestToken: "N/A",
      bestRoute: "N/A",
      worstRoute: "N/A",
      topTokens: [],
      topRoutes: [],
      topDexes: [],
      sizeAnalysis: [],
    };
  }

  // Calculate basic stats
  const profitable = opportunities.filter((o) => o.net_profit > 0);
  const totalProfits = opportunities.reduce((sum, o) => sum + o.net_profit, 0);
  const avgProfit = totalProfits / opportunities.length;
  const maxProfit = Math.max(...opportunities.map((o) => o.net_profit));
  const minProfit = Math.min(...opportunities.map((o) => o.net_profit));

  // Group by token
  const tokenMap = new Map<
    string,
    { profit: number; count: number; profitable: number }
  >();
  for (const opp of opportunities) {
    const existing = tokenMap.get(opp.token) || {
      profit: 0,
      count: 0,
      profitable: 0,
    };
    tokenMap.set(opp.token, {
      profit: existing.profit + opp.net_profit,
      count: existing.count + 1,
      profitable:
        existing.profitable + (opp.net_profit > 0 ? 1 : 0),
    });
  }

  const topTokens = Array.from(tokenMap.entries())
    .map(([token, { profit, count }]) => ({ token, profit, count }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const bestToken =
    topTokens && topTokens.length > 0 ? topTokens[0]!.token : "N/A";

  // Group by route
  const routeMap = new Map<
    string,
    { profit: number; count: number; profitable: number }
  >();
  for (const opp of opportunities) {
    const existing = routeMap.get(opp.route) || {
      profit: 0,
      count: 0,
      profitable: 0,
    };
    routeMap.set(opp.route, {
      profit: existing.profit + opp.net_profit,
      count: existing.count + 1,
      profitable:
        existing.profitable + (opp.net_profit > 0 ? 1 : 0),
    });
  }

  const topRoutes = Array.from(routeMap.entries())
    .map(([route, { profit, count }]) => ({ route, profit, count }))
    .sort((a, b) => b.profit - a.profit);

  const bestRoute = topRoutes && topRoutes.length > 0 ? topRoutes[0]!.route : "N/A";
  const worstRoute =
    topRoutes && topRoutes.length > 0
      ? topRoutes[topRoutes.length - 1]!.route
      : "N/A";

  // Group by DEX
  const dexMap = new Map<
    string,
    { profit: number; count: number; profitable: number }
  >();
  for (const opp of opportunities) {
    for (const dex of [opp.dex_buy, opp.dex_sell]) {
      const existing = dexMap.get(dex) || {
        profit: 0,
        count: 0,
        profitable: 0,
      };
      dexMap.set(dex, {
        profit: existing.profit + opp.net_profit,
        count: existing.count + 1,
        profitable:
          existing.profitable + (opp.net_profit > 0 ? 1 : 0),
      });
    }
  }

  const topDexes = Array.from(dexMap.entries())
    .map(([dex, { profit, count }]) => ({ dex, profit, count }))
    .sort((a, b) => b.profit - a.profit);

  // Group by size
  const sizeMap = new Map<
    number,
    { profits: number[]; count: number; profitable: number }
  >();
  for (const opp of opportunities) {
    const size = opp.size;
    const existing = sizeMap.get(size) || {
      profits: [],
      count: 0,
      profitable: 0,
    };
    sizeMap.set(size, {
      profits: [...existing.profits, opp.net_profit],
      count: existing.count + 1,
      profitable:
        existing.profitable + (opp.net_profit > 0 ? 1 : 0),
    });
  }

  const sizeAnalysis = Array.from(sizeMap.entries())
    .map(([size, { profits, count, profitable }]) => ({
      size,
      count,
      avgProfit: profits.reduce((a, b) => a + b, 0) / count,
      profitableCount: profitable,
    }))
    .sort((a, b) => a.size - b.size);

  return {
    totalScans: opportunities.length,
    profitableCount: profitable.length,
    profitablePercentage: Number(
      ((profitable.length / opportunities.length) * 100).toFixed(2)
    ),
    averageProfit: Number(avgProfit.toFixed(2)),
    maxProfit: Number(maxProfit.toFixed(2)),
    minProfit: Number(minProfit.toFixed(2)),
    bestToken,
    bestRoute,
    worstRoute,
    topTokens,
    topRoutes: topRoutes.slice(0, 5),
    topDexes,
    sizeAnalysis,
  };
}

/**
 * Get statistics for the last 5 minutes
 */
export function getStats5Min(): OpportunitiesStats {
  return getStatsSince(5 * 60);
}

/**
 * Get statistics for the last hour
 */
export function getStats1Hour(): OpportunitiesStats {
  return getStatsSince(60 * 60);
}

/**
 * Get statistics for the last 24 hours
 */
export function getStats24Hours(): OpportunitiesStats {
  return getStatsSince(24 * 60 * 60);
}

/**
 * Get statistics for all time
 */
export function getStatsAllTime(): OpportunitiesStats {
  const maxSeconds = 365 * 24 * 60 * 60; // 1 year
  return getStatsSince(maxSeconds);
}

/**
 * Get opportunity lifetime tracking: how long an opportunity persists
 */
export function getOpportunityLifetime(
  token: string,
  route: string,
  size: number,
  secondsWindow: number = 3600
): { count: number; avgDuration: number; instances: number } {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - secondsWindow;

  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE token = ? AND route = ? AND size = ?
    AND timestamp >= ?
    ORDER BY timestamp ASC
  `);

  const opportunities = stmt.all(
    token,
    route,
    size,
    cutoffTimestamp
  ) as StoredOpportunity[];

  if (opportunities.length === 0) {
    return { count: 0, avgDuration: 0, instances: 0 };
  }

  // Calculate duration of consecutive opportunities
  let instances = 1;
  let totalDuration = 0;
  let sequenceStart = opportunities[0]!.timestamp;

  for (let i = 1; i < opportunities.length; i++) {
    const timeDiff = opportunities[i]!.timestamp - opportunities[i - 1]!.timestamp;

    // If gap is more than 30 seconds, consider it a new instance
    if (timeDiff > 30) {
      totalDuration += opportunities[i - 1]!.timestamp - sequenceStart;
      sequenceStart = opportunities[i]!.timestamp;
      instances++;
    }
  }

  // Add the last sequence
  totalDuration += opportunities[opportunities.length - 1]!.timestamp - sequenceStart;

  return {
    count: opportunities.length,
    avgDuration: Number((totalDuration / instances).toFixed(2)),
    instances,
  };
}

export default {
  getStatsSince,
  getStats5Min,
  getStats1Hour,
  getStats24Hours,
  getStatsAllTime,
  getOpportunityLifetime,
};
