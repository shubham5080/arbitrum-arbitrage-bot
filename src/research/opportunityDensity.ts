import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { PoolLiquidityRank } from "./liquidityRanking";
import { TokenExpansionRank } from "./tokenCoverage";

export interface HistoricalDensity {
  token: string;
  route: string;
  count: number;
  avgProfit: number;
  falsePositive: boolean;
}

export interface DensityEstimate {
  token: string;
  dexPairsAvailable: number;
  routeEvaluationsPerScan: number;
  historicalProfitableHits: number;
  estimatedOpportunityDensity: "high" | "medium" | "low" | "none";
  notes: string;
}

const SIZES_PER_SCAN = 9; // scanMarket sizes array length

export function estimateOpportunityDensity(
  liquidityRanks: PoolLiquidityRank[],
  historical: HistoricalDensity[],
  expansionTokens: TokenExpansionRank[]
): DensityEstimate[] {
  const estimates: DensityEstimate[] = [];

  // Current scanned tokens
  const scannedSymbols = Object.keys(TOKENS).filter((s) => s !== "USDC");

  for (const symbol of scannedSymbols) {
    const pools = liquidityRanks.filter((r) => r.token === symbol);
    const dexes = [...new Set(pools.map((p) => p.dex))];
    const dexPairs = dexes.length >= 2 ? dexes.length * (dexes.length - 1) : 0;
    const hist = historical.filter((h) => h.token === symbol);
    const histCount = hist.reduce((s, h) => s + h.count, 0);
    const allFalsePositive = hist.every((h) => h.falsePositive);

    let density: DensityEstimate["estimatedOpportunityDensity"] = "none";
    let notes = "";

    if (dexPairs === 0) {
      notes = "Insufficient DEX coverage for cross-DEX arb";
    } else if (allFalsePositive && histCount > 0) {
      density = "none";
      notes = `${histCount} historical hits were 100% false positives (quote bug or sub-cost spreads)`;
    } else if (dexPairs >= 6 && pools.length >= 3) {
      density = "medium";
      notes = "Good DEX coverage but efficient pricing post-fix";
    } else if (dexPairs >= 2) {
      density = "low";
      notes = "Limited route universe";
    }

    estimates.push({
      token: symbol,
      dexPairsAvailable: dexPairs,
      routeEvaluationsPerScan: dexPairs * SIZES_PER_SCAN,
      historicalProfitableHits: histCount,
      estimatedOpportunityDensity: density,
      notes,
    });
  }

  // Expansion token projections
  for (const token of expansionTokens.slice(0, 10)) {
    const dexes = token.dexCount;
    const dexPairs = dexes >= 2 ? dexes * (dexes - 1) : 0;

    let density: DensityEstimate["estimatedOpportunityDensity"] = "none";
    let notes = token.rationale;

    if (dexPairs >= 6 && token.volumeTier >= 4) {
      density = "high";
      notes = "Multi-DEX + high volume — best expansion candidate";
    } else if (dexPairs >= 2 && token.volumeTier >= 3) {
      density = "medium";
    } else if (dexPairs >= 2) {
      density = "low";
    }

    estimates.push({
      token: token.symbol,
      dexPairsAvailable: dexPairs,
      routeEvaluationsPerScan: dexPairs * SIZES_PER_SCAN,
      historicalProfitableHits: 0,
      estimatedOpportunityDensity: density,
      notes,
    });
  }

  return estimates.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2, none: 3 };
    return order[a.estimatedOpportunityDensity] - order[b.estimatedOpportunityDensity];
  });
}

export function rankRoutesByLikelihood(estimates: DensityEstimate[]) {
  return estimates
    .filter((e) => e.dexPairsAvailable >= 2)
    .map((e) => ({
      token: e.token,
      maxRoutes: e.dexPairsAvailable,
      density: e.estimatedOpportunityDensity,
      evaluationsPerScan: e.routeEvaluationsPerScan,
    }));
}

export const SCANNED_DEX_LIST = [DEXES.UNISWAP, DEXES.SUSHI, DEXES.CAMELOT];
