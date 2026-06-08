import { DEXES } from "../config/dexes";
import { CANDIDATE_DEXES, ResearchDex } from "./arbitrumUniverse";
import { PoolLiquidityRank } from "./liquidityRanking";

export interface DexCoverageResult {
  scanned: string[];
  missing: ResearchDex[];
  poolCounts: Record<string, number>;
  expansionRankings: DexExpansionRank[];
}

export interface DexExpansionRank {
  id: string;
  name: string;
  volume30dUsd: number;
  tvlUsd: number;
  quoteAccessibility: string;
  integrationComplexity: string;
  poolsFound: number;
  integrationScore: number;
  rationale: string;
}

export function auditDexCoverage(liquidityRanks: PoolLiquidityRank[]): DexCoverageResult {
  const scanned = Object.values(DEXES);
  const scannedSet = new Set(scanned);

  const missing = CANDIDATE_DEXES.filter((d) => !d.scanned);

  const poolCounts: Record<string, number> = {};
  for (const rank of liquidityRanks) {
    poolCounts[rank.dex] = (poolCounts[rank.dex] ?? 0) + 1;
  }

  const expansionRankings: DexExpansionRank[] = missing.map((dex) => {
    const poolsFound = poolCounts[dex.id] ?? 0;

    const volScore = Math.min(40, dex.volume30dUsd / 25_000_000);
    const accessScore = dex.quoteAccessibility === "high" ? 25 : dex.quoteAccessibility === "medium" ? 15 : 5;
    const complexityPenalty =
      dex.integrationComplexity === "low" ? 0 : dex.integrationComplexity === "medium" ? 10 : 25;
    const poolScore = poolsFound * 5;
    const integrationScore = volScore + accessScore + poolScore - complexityPenalty;

    let rationale = "";
    if (dex.id === "PANCAKESWAP") {
      rationale = "Highest ROI: V3 quoter-compatible, ~$300M/mo volume, not yet scanned";
    } else if (dex.id === "CURVE") {
      rationale = "Stablecoin peg inefficiencies; high complexity, niche edge";
    } else if (dex.id === "BALANCER") {
      rationale = "Weighted pools; useful for ecosystem tokens, vault model adds complexity";
    } else if (dex.id === "FLUID") {
      rationale = "High volume but proprietary — quote access difficult";
    } else {
      rationale = dex.notes;
    }

    return {
      id: dex.id,
      name: dex.name,
      volume30dUsd: dex.volume30dUsd,
      tvlUsd: dex.tvlUsd,
      quoteAccessibility: dex.quoteAccessibility,
      integrationComplexity: dex.integrationComplexity,
      poolsFound,
      integrationScore,
      rationale,
    };
  });

  expansionRankings.sort((a, b) => b.integrationScore - a.integrationScore);

  return { scanned, missing, poolCounts, expansionRankings };
}
