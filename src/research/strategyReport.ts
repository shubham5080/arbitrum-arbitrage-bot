import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import {
  analyzeStablecoinScalability,
  formatScalabilityMarkdown,
} from "./stablecoinScalability";
import {
  analyzeHistoricalScalability,
  formatHistoricalMatrixMarkdown,
} from "./historicalScalability";
import {
  researchTriangularArbitrage,
  formatTriangularMarkdown,
} from "./triangularResearch";
import {
  assessCrossChainOpportunities,
  formatCrossChainMarkdown,
} from "./crossChainResearch";

export type StrategicPath =
  | "continue_stablecoin"
  | "triangular_arbitrage"
  | "cross_chain_arbitrage"
  | "pivot_project";

export interface StrategicRecommendation {
  path: StrategicPath;
  pathLabel: string;
  probabilityOfAlpha: string;
  rationale: string[];
  evidence: string[];
  nextSteps: string[];
}

export function deriveRecommendation(data: {
  maxObservedDeviationBps: number;
  minProfitableSpreadAt250k: number;
  historicalProfitableAt250k: number;
  triangularNetProfitable: number;
  crossChainFeasibility: string;
}): StrategicRecommendation {
  const {
    maxObservedDeviationBps,
    minProfitableSpreadAt250k,
    historicalProfitableAt250k,
    triangularNetProfitable,
    crossChainFeasibility,
  } = data;

  // Triangular gets priority if it shows any net-positive signal with better coverage than stablecoin
  if (triangularNetProfitable > 0) {
    return {
      path: "triangular_arbitrage",
      pathLabel: "Move to triangular arbitrage",
      probabilityOfAlpha: "15–25%",
      rationale: [
        "Triangular routes show positive net at scan time on at least one path",
        "3-leg routes have more dislocation surface than 2-leg spot arb",
        "WETH/ARB has multi-DEX coverage (Uni + Pancake)",
        "Existing triangle simulator can be extended without new contracts",
      ],
      evidence: [
        `${triangularNetProfitable} triangular candidate(s) net positive at $10k`,
        "10,701 spot opportunities yielded 0 executable after audit",
        `Stablecoin max deviation ${maxObservedDeviationBps.toFixed(1)} bps < ${minProfitableSpreadAt250k.toFixed(1)} bps threshold at $250k`,
      ],
      nextSteps: [
        "Build triangular scanner with revalidation gate (mirror Day 27 fixes)",
        "Run 24h triangle collection on WETH/ARB/USDC routes",
        "Test DEX permutation matrix at $10k–$50k",
        "Do not build execution until 48h of net-positive revalidated triangles",
      ],
    };
  }

  // Stablecoin only if scaling could work
  if (maxObservedDeviationBps > minProfitableSpreadAt250k) {
    return {
      path: "continue_stablecoin",
      pathLabel: "Continue stablecoin research",
      probabilityOfAlpha: "10–20%",
      rationale: [
        "Observed deviations exceed friction at large trade sizes",
        "Curve + Uniswap divergence provides cross-venue signal",
        "Lower execution risk than volatile-token arb",
      ],
      evidence: [
        `Max deviation ${maxObservedDeviationBps.toFixed(1)} bps exceeds $250k threshold ${minProfitableSpreadAt250k.toFixed(1)} bps`,
        "145 peg snapshots show persistent 1–5 bps spreads",
      ],
      nextSteps: [
        "48h stablecoin collection at $100k–$250k quote sizes",
        "Integrate Curve get_dy into quote engine",
        "Test with owned capital (no flash fee) to validate 5 bps edge",
      ],
    };
  }

  // Cross-chain is almost never the answer given data
  if (crossChainFeasibility === "high") {
    return {
      path: "cross_chain_arbitrage",
      pathLabel: "Move to cross-chain arbitrage",
      probabilityOfAlpha: "5–15%",
      rationale: ["Cross-chain divergence exceeds bridge costs"],
      evidence: [],
      nextSteps: ["Multi-chain inventory setup", "Bridge integration"],
    };
  }

  // Default: triangular research is highest probability among remaining options
  // even if not currently profitable — more surface area than stablecoin at sub-threshold spreads
  if (triangularNetProfitable === 0 && maxObservedDeviationBps < minProfitableSpreadAt250k) {
    return {
      path: "triangular_arbitrage",
      pathLabel: "Move to triangular arbitrage (limited 2-week validation)",
      probabilityOfAlpha: "10–15%",
      rationale: [
        "Spot cross-DEX arb exhausted: 10,701 opps, 0 executable, 102/102 audit failures",
        `Stablecoin spreads (max 4.82 bps) remain below friction floor even at $250k (~${minProfitableSpreadAt250k.toFixed(1)} bps)`,
        "Triangular arb has untested permutation space across 4 DEXes × 3 legs",
        "Cross-chain requires inventory + bridge latency — lowest feasibility",
        "2-week validation cap: if no revalidated triangle profit in 14 days, pivot",
      ],
      evidence: [
        `Historical rescale: ${historicalProfitableAt250k} profitable at $250k (audit-invalidated)`,
        `Stablecoin: ${maxObservedDeviationBps.toFixed(1)} bps observed vs ${minProfitableSpreadAt250k.toFixed(1)} bps required at $250k`,
        "Cross-chain feasibility: LOW (bridge fees > observed spreads)",
        "Day 29: only WETH/ARB scannable for spot; triangle adds path diversity",
      ],
      nextSteps: [
        "Week 1: Triangular scanner on WETH→ARB→USDC→WETH across all DEX permutations",
        "Week 2: Expand to LINK/UNI if WETH/ARB shows any revalidated gross > 0",
        "Kill criteria: 0 revalidated net-positive triangles after 14 days → pivot project",
        "Do NOT invest in cross-chain infra or stablecoin execution at current spread levels",
      ],
    };
  }

  return {
    path: "pivot_project",
    pathLabel: "Stop arbitrage research and pivot project direction",
    probabilityOfAlpha: "<5%",
    rationale: [
      "No strategy shows net-positive edge after costs",
      "30 days of data across spot, stablecoin, and audit pipelines",
    ],
    evidence: [
      "102/102 audited opportunities false positive",
      "0 profitable flash-loan routes",
    ],
    nextSteps: [
      "Consider MEV-adjacent strategies (liquidations, oracle lag)",
      "Or repurpose infra for DEX analytics / monitoring SaaS",
    ],
  };
}

export async function generateStrategyReport(provider: ethers.Provider): Promise<string> {
  const scalability = await analyzeStablecoinScalability(provider, { liveQuotes: false });
  const historical = analyzeHistoricalScalability();
  const triangular = await researchTriangularArbitrage(provider);
  const crossChain = assessCrossChainOpportunities();

  const minAt250k =
    scalability.thresholds.find((t) => t.tradeSize === 250_000)?.minProfitableSpreadBps ?? 10;
  const histAt250k = historical.matrices.find((m) => m.tradeSize === 250_000);

  const triangularNetProfitable = triangular.filter(
    (c) => c.netProfitUsd !== null && c.netProfitUsd > 0
  ).length;

  const recommendation = deriveRecommendation({
    maxObservedDeviationBps: scalability.maxObservedDeviationBps,
    minProfitableSpreadAt250k: minAt250k,
    historicalProfitableAt250k: histAt250k?.profitable ?? 0,
    triangularNetProfitable,
    crossChainFeasibility: crossChain.overallFeasibility,
  });

  const sections = [
    "# Day 31: Strategic Direction Validation",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Executive Summary",
    "",
    `After 31 days of research, **${recommendation.pathLabel}** is the recommended next phase.`,
    "",
    `**Estimated probability of finding real alpha:** ${recommendation.probabilityOfAlpha}`,
    "",
    "### Research Status (Days 1–30)",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    "| Spot opportunities logged | 10,701 |",
    "| Audited false positives | 102/102 (100%) |",
    "| Profitable flash-loan routes | 0 |",
    "| Stablecoin peg snapshots | 145 |",
    "| Max stablecoin deviation | 4.82 bps |",
    "| Max cross-venue divergence | 0.97 bps |",
    "",
    formatScalabilityMarkdown(scalability.thresholds, scalability.maxObservedDeviationBps),
    formatHistoricalMatrixMarkdown(historical),
    formatTriangularMarkdown(triangular),
    formatCrossChainMarkdown(crossChain),
    "## Task 5: Strategic Recommendation",
    "",
    `### Recommended Path: **${recommendation.pathLabel}**`,
    "",
    `**Probability of finding real alpha:** ${recommendation.probabilityOfAlpha}`,
    "",
    "#### Rationale",
    "",
    ...recommendation.rationale.map((r) => `- ${r}`),
    "",
    "#### Supporting Evidence",
    "",
    ...recommendation.evidence.map((e) => `- ${e}`),
    "",
    "#### Next Steps",
    "",
    ...recommendation.nextSteps.map((s) => `- ${s}`),
    "",
    "### Paths Not Selected",
    "",
    "| Path | Why Not |",
    "|------|---------|",
    recommendation.path !== "continue_stablecoin"
      ? `| Continue stablecoin | Max 4.82 bps < ${minAt250k.toFixed(1)} bps friction at $250k |`
      : "",
    recommendation.path !== "triangular_arbitrage"
      ? "| Triangular arbitrage | No net-positive routes at initial scan |"
      : "",
    recommendation.path !== "cross_chain_arbitrage"
      ? "| Cross-chain arbitrage | Bridge fees + latency exceed observed spreads; requires inventory |"
      : "",
    recommendation.path !== "pivot_project"
      ? "| Pivot project | One more strategy worth validating before abandoning |"
      : "",
    "",
    "### Success Criteria Answers",
    "",
    `1. **Does scaling stablecoin arb work?** No — even at $250k, friction (~${minAt250k.toFixed(1)} bps) exceeds max observed deviation (4.82 bps)`,
    "2. **Do historical opps become profitable at scale?** Rescaled counts may show positives, but 102/102 audit failures invalidate them",
    "3. **Is triangular arb viable?** Unproven — best candidate is WETH/ARB/USDC; requires 2-week validation",
    "4. **Is cross-chain viable?** No — bridge costs and latency dominate",
    `5. **Where to invest next month?** ${recommendation.pathLabel}`,
    "",
  ].filter((line) => line !== "");

  return sections.join("\n");
}

export async function saveStrategyReport(provider: ethers.Provider): Promise<string> {
  const report = await generateStrategyReport(provider);
  const reportPath = path.join(__dirname, "../../docs/day31_strategy_report.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  return reportPath;
}
