import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  initializeDatabase,
  closeDatabase,
  getRecentOpportunities,
} from "../database/database";
import { simulateOpportunity } from "./executionSimulator";
import { saveReplayReport } from "./replayReport";
import { ReplayReportData, ReplayResult } from "./types";

dotenv.config();

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) {
  throw new Error("RPC_URL is required in .env to run replay analysis");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const DEFAULT_DELAY_SECONDS = [5, 10, 30, 60, 120];

export async function runReplayAnalysis(
  windowSeconds = 3600,
  delayIntervals: number[] = DEFAULT_DELAY_SECONDS
): Promise<{ report: ReplayReportData; reportPath: string }> {
  initializeDatabase();

  const opportunities = getRecentOpportunities(windowSeconds).filter(
    (opp) => opp.net_profit > 0
  );

  if (opportunities.length === 0) {
    closeDatabase();
    throw new Error(
      `No recent profitable opportunities found in the last ${windowSeconds} seconds.`
    );
  }

  const results: ReplayResult[] = [];

  for (const opportunity of opportunities) {
    for (const delaySeconds of delayIntervals) {
      const replayResult = await simulateOpportunity(
        provider,
        opportunity,
        delaySeconds
      );
      results.push(replayResult);
    }
  }

  const report = buildReplayReportData(results, opportunities.length, windowSeconds);
  const reportPath = saveReplayReport(report);

  closeDatabase();
  return { report, reportPath };
}

function groupByKey<T>(items: T[], selector: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = selector(item);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}

export function buildReplayReportData(
  results: ReplayResult[],
  recentOpportunities: number,
  replayWindowSeconds: number
): ReplayReportData {
  const totalReplays = results.length;
  const delayStats = buildDelayStats(results);
  const routeStats = buildRouteStats(results);
  const tokenStats = buildTokenStats(results);
  const topSurvivors = buildTopSurvivors(results);

  return {
    generatedAt: new Date().toISOString(),
    replayWindowSeconds,
    recentOpportunities,
    totalReplays,
    delayStats,
    tokenStats,
    routeStats,
    topSurvivors,
  };
}

function buildDelayStats(results: ReplayResult[]) {
  const delayGroups = groupByKey(results, (result) => result.delaySeconds.toString());
  const stats = Array.from(delayGroups.entries()).map(([delayKey, group]) => {
    const total = group.length;
    const stillProfitable = group.filter((result) => result.currentProfit > 0).length;
    const executableCount = group.filter(
      (result) => result.classification === "EXECUTABLE"
    ).length;
    const marginalCount = group.filter(
      (result) => result.classification === "MARGINAL"
    ).length;
    const deadCount = group.filter((result) => result.classification === "DEAD").length;
    const averageCurrentProfit =
      total > 0
        ? group.reduce((sum, result) => sum + result.currentProfit, 0) / total
        : 0;
    const averageProfitChangePct =
      total > 0
        ? group.reduce((sum, result) => sum + result.profitChangePct, 0) / total
        : 0;
    const bestCurrentProfit = group.reduce(
      (best, result) => Math.max(best, result.currentProfit),
      Number.NEGATIVE_INFINITY
    );

    return {
      delaySeconds: Number(delayKey),
      total,
      stillProfitable,
      survivalRate: total > 0 ? (stillProfitable / total) * 100 : 0,
      executableCount,
      marginalCount,
      deadCount,
      averageCurrentProfit,
      averageProfitChangePct,
      bestCurrentProfit,
    };
  });

  return stats.sort((a, b) => a.delaySeconds - b.delaySeconds);
}

function buildTokenStats(results: ReplayResult[]) {
  const tokenGroups = groupByKey(results, (result) => result.token);
  const stats = Array.from(tokenGroups.entries()).map(([token, group]) => {
    const total = group.length;
    const stillProfitable = group.filter((result) => result.currentProfit > 0).length;
    const executableCount = group.filter(
      (result) => result.classification === "EXECUTABLE"
    ).length;
    const marginalCount = group.filter(
      (result) => result.classification === "MARGINAL"
    ).length;
    const deadCount = group.filter((result) => result.classification === "DEAD").length;

    return {
      token,
      total,
      stillProfitable,
      survivalRate: total > 0 ? (stillProfitable / total) * 100 : 0,
      executableCount,
      marginalCount,
      deadCount,
    };
  });

  return stats.sort((a, b) => b.survivalRate - a.survivalRate);
}

function buildRouteStats(results: ReplayResult[]) {
  const routeGroups = groupByKey(results, (result) => result.route);
  const stats = Array.from(routeGroups.entries()).map(([route, group]) => {
    const total = group.length;
    const stillProfitable = group.filter((result) => result.currentProfit > 0).length;
    const executableCount = group.filter(
      (result) => result.classification === "EXECUTABLE"
    ).length;
    const marginalCount = group.filter(
      (result) => result.classification === "MARGINAL"
    ).length;
    const deadCount = group.filter((result) => result.classification === "DEAD").length;

    return {
      route,
      total,
      stillProfitable,
      survivalRate: total > 0 ? (stillProfitable / total) * 100 : 0,
      executableCount,
      marginalCount,
      deadCount,
    };
  });

  return stats.sort((a, b) => b.survivalRate - a.survivalRate);
}

function buildTopSurvivors(results: ReplayResult[]) {
  const groupedByOpportunity = new Map<string, ReplayResult[]>();
  for (const result of results) {
    const key = result.opportunityKey;
    const existing = groupedByOpportunity.get(key) || [];
    existing.push(result);
    groupedByOpportunity.set(key, existing);
  }

  const survivors = Array.from(groupedByOpportunity.entries()).map(
    ([key, group]) => {
      const sortedByDelay = group.sort((a, b) => a.delaySeconds - b.delaySeconds);
      const survivedDelays = sortedByDelay.filter((result) => result.currentProfit > 0).length;
      const maxDelayWithProfit =
        sortedByDelay
          .filter((result) => result.currentProfit > 0)
          .map((result) => result.delaySeconds)
          .reduce((max, value) => Math.max(max, value), 0);
      const maxDelayResult =
        sortedByDelay.find((result) => result.delaySeconds === 120) ||
        sortedByDelay[sortedByDelay.length - 1]!;

      return {
        token: maxDelayResult.token,
        route: maxDelayResult.route,
        size: maxDelayResult.size,
        ...(maxDelayResult.opportunityId !== undefined ? { opportunityId: maxDelayResult.opportunityId } : {}),
        originalProfit: maxDelayResult.originalProfit,
        survivedDelays,
        maxDelayWithProfit,
        classificationAtMaxDelay: maxDelayResult.classification,
        currentProfitAtMaxDelay: maxDelayResult.currentProfit,
        reasonAtMaxDelay: maxDelayResult.reason,
      };
    }
  );

  return survivors.sort((a, b) => {
    if (b.survivedDelays !== a.survivedDelays) {
      return b.survivedDelays - a.survivedDelays;
    }
    return b.currentProfitAtMaxDelay - a.currentProfitAtMaxDelay;
  });
}
