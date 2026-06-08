import { DexExpansionRank } from "./dexCoverage";
import { TokenExpansionRank } from "./tokenCoverage";
import { StrategyAssessment } from "./strategyAnalysis";

export interface PrioritizationEntry {
  rank: number;
  category: "token" | "dex" | "strategy";
  id: string;
  name: string;
  expectedProfitability: number;
  engineeringEffort: number;
  capitalRequirement: string;
  executionRisk: string;
  compositeScore: number;
  recommendation: string;
}

function effortInverse(effort: number): number {
  return 6 - effort;
}

export function buildPrioritizationMatrix(
  tokens: TokenExpansionRank[],
  dexes: DexExpansionRank[],
  strategies: StrategyAssessment[]
): PrioritizationEntry[] {
  const entries: PrioritizationEntry[] = [];

  for (const t of tokens.slice(0, 8)) {
    const profitability = Math.min(5, Math.ceil(t.score / 20));
    const effort = t.dexCount >= 2 ? 2 : 3;
    const composite =
      profitability * 3 + effortInverse(effort) * 2 + t.dexCount * 2 + t.volumeTier;
    entries.push({
      rank: 0,
      category: "token",
      id: t.symbol,
      name: t.symbol,
      expectedProfitability: profitability,
      engineeringEffort: effort,
      capitalRequirement: "medium",
      executionRisk: "medium",
      compositeScore: composite,
      recommendation: t.rationale,
    });
  }

  for (const d of dexes.slice(0, 5)) {
    const profitability = Math.min(5, Math.ceil(d.volume30dUsd / 200_000_000));
    const effort =
      d.integrationComplexity === "low" ? 2 : d.integrationComplexity === "medium" ? 3 : 4;
    const composite = profitability * 3 + effortInverse(effort) * 2 + d.integrationScore / 5;
    entries.push({
      rank: 0,
      category: "dex",
      id: d.id,
      name: d.name,
      expectedProfitability: profitability,
      engineeringEffort: effort,
      capitalRequirement: "medium",
      executionRisk: "medium",
      compositeScore: composite,
      recommendation: d.rationale,
    });
  }

  for (const s of strategies) {
    const composite =
      s.expectedProfitability * 3 +
      effortInverse(s.engineeringEffort) * 2 +
      (s.viability === "high" ? 10 : s.viability === "medium" ? 6 : s.viability === "low" ? 2 : 0);
    entries.push({
      rank: 0,
      category: "strategy",
      id: s.id,
      name: s.name,
      expectedProfitability: s.expectedProfitability,
      engineeringEffort: s.engineeringEffort,
      capitalRequirement: s.capitalRequirement,
      executionRisk: s.executionRisk,
      compositeScore: composite,
      recommendation: s.notes,
    });
  }

  entries.sort((a, b) => b.compositeScore - a.compositeScore);
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  return entries;
}
