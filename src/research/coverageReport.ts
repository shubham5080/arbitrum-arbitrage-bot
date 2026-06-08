import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { CANDIDATE_TOKENS } from "./arbitrumUniverse";
import { rankAllTokenLiquidity } from "./liquidityRanking";
import { auditTokenCoverage } from "./tokenCoverage";
import { auditDexCoverage } from "./dexCoverage";
import {
  estimateOpportunityDensity,
  HistoricalDensity,
  rankRoutesByLikelihood,
} from "./opportunityDensity";
import { assessAlternativeStrategies } from "./strategyAnalysis";
import { buildPrioritizationMatrix } from "./prioritization";

export interface AlphaDiscoveryReport {
  generatedAt: string;
  tokenCoverage: ReturnType<typeof auditTokenCoverage>;
  dexCoverage: ReturnType<typeof auditDexCoverage>;
  topPools: { token: string; dex: string; liquidity: string; poolAddress: string }[];
  densityEstimates: ReturnType<typeof estimateOpportunityDensity>;
  strategies: ReturnType<typeof assessAlternativeStrategies>;
  prioritization: ReturnType<typeof buildPrioritizationMatrix>;
}

export async function runAlphaDiscovery(
  provider: ethers.Provider,
  historical: HistoricalDensity[] = []
): Promise<AlphaDiscoveryReport> {
  console.log("Probing on-chain USDC pool liquidity across 4 V3 DEX factories...");
  const liquidityRanks = await rankAllTokenLiquidity(provider, CANDIDATE_TOKENS);

  const tokenCoverage = auditTokenCoverage(liquidityRanks);
  const dexCoverage = auditDexCoverage(liquidityRanks);
  const densityEstimates = estimateOpportunityDensity(
    liquidityRanks,
    historical,
    tokenCoverage.expansionCandidates
  );
  const strategies = assessAlternativeStrategies();
  const prioritization = buildPrioritizationMatrix(
    tokenCoverage.expansionCandidates,
    dexCoverage.expansionRankings,
    strategies
  );

  const topPools = liquidityRanks.slice(0, 25).map((p) => ({
    token: p.token,
    dex: p.dex,
    liquidity: p.liquidity.toString(),
    poolAddress: p.poolAddress,
  }));

  return {
    generatedAt: new Date().toISOString(),
    tokenCoverage,
    dexCoverage,
    topPools,
    densityEstimates,
    strategies,
    prioritization,
  };
}

function formatLiquidity(liq: bigint): string {
  const n = Number(liq / 10n ** 15n);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}e18`;
  return `${n.toFixed(0)}e15`;
}

export function renderMarkdownReport(report: AlphaDiscoveryReport): string {
  const lines: string[] = [];

  lines.push("# Day 28: Alpha Discovery & Market Expansion");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push("");

  // Success criteria upfront
  lines.push("## Executive Summary");
  lines.push("");
  lines.push("Day 27 fixed the quote engine. Day 28 expands the search space to find where real alpha might exist.");
  lines.push("");
  lines.push("### Success Criteria Answers");
  lines.push("");
  lines.push("1. **Why are current routes unprofitable?** Efficient market pricing — real spreads (~0.1%) are below gas + flash loan costs. Historical profits were phantom quote bugs.");
  lines.push("2. **What markets are not being scanned?** 14+ tokens (GMX, PENDLE, stables, etc.) and 6+ DEXes (PancakeSwap, Curve, Balancer, Fluid).");
  lines.push("3. **Which DEX should be added next?** **PancakeSwap V3** — ~$300M/mo volume, V3 quoter-compatible, low integration effort.");
  lines.push("4. **Which token set should be added next?** **GMX, PENDLE, USDT, DAI** — multi-DEX USDC liquidity + high volume tier.");
  lines.push("5. **Highest expected edge strategy?** **Stablecoin peg arb** or **triangular routes** on expanded universe; **new listings** for event-driven spikes.");
  lines.push("6. **Day 29 focus?** Integrate PancakeSwap V3 + expand token config; run coverage scan on 10+ tokens × 4 DEXes.");
  lines.push("");

  lines.push("## Market Coverage");
  lines.push("");
  lines.push("### Currently Scanned");
  lines.push(`- **Tokens:** ${report.tokenCoverage.scanned.join(", ")}`);
  lines.push(`- **DEXes:** ${report.dexCoverage.scanned.join(", ")}`);
  lines.push(`- **Route model:** Cross-DEX spot (buy DEX A → sell DEX B), 9 trade sizes`);
  lines.push(`- **Coverage gap:** LINK and UNI have only 1 probed DEX each — scanner cannot form cross-DEX routes for them`);
  lines.push(`- **Camelot gap:** Camelot pools found for few pairs via V3 factory probe — may need separate V2 discovery`);
  lines.push("");

  lines.push("## Missing Tokens");
  lines.push("");
  lines.push("| Rank | Token | Category | DEX Pools | Best DEX | Score | Rationale |");
  lines.push("|------|-------|----------|-----------|----------|-------|-----------|");
  report.tokenCoverage.expansionCandidates.slice(0, 12).forEach((t, i) => {
    lines.push(
      `| ${i + 1} | ${t.symbol} | ${t.category} | ${t.dexCount} | ${t.bestDex ?? "—"} | ${t.score.toFixed(0)} | ${t.rationale} |`
    );
  });
  lines.push("");

  lines.push("## Missing DEXs");
  lines.push("");
  lines.push("| DEX | 30d Volume | TVL | Quote Access | Complexity | Pools Found | Score |");
  lines.push("|-----|------------|-----|--------------|------------|-------------|-------|");
  for (const d of report.dexCoverage.expansionRankings) {
    lines.push(
      `| ${d.name} | $${(d.volume30dUsd / 1e6).toFixed(0)}M | $${(d.tvlUsd / 1e6).toFixed(0)}M | ${d.quoteAccessibility} | ${d.integrationComplexity} | ${d.poolsFound} | ${d.integrationScore.toFixed(0)} |`
    );
  }
  lines.push("");

  lines.push("## Liquidity Rankings");
  lines.push("");
  lines.push("Top USDC pools by on-chain V3 `liquidity()` (higher = deeper):");
  lines.push("");
  lines.push("| Rank | Token | DEX | Liquidity | Pool |");
  lines.push("|------|-------|-----|-----------|------|");
  report.topPools.slice(0, 20).forEach((p, i) => {
    lines.push(
      `| ${i + 1} | ${p.token} | ${p.dex} | ${formatLiquidity(BigInt(p.liquidity))} | \`${p.poolAddress.slice(0, 10)}...\` |`
    );
  });
  lines.push("");

  lines.push("## Opportunity Density Analysis");
  lines.push("");
  lines.push("| Token | DEX Pairs | Evals/Scan | Historical Hits | Density | Notes |");
  lines.push("|-------|-----------|------------|-----------------|---------|-------|");
  for (const e of report.densityEstimates.slice(0, 15)) {
    lines.push(
      `| ${e.token} | ${e.dexPairsAvailable} | ${e.routeEvaluationsPerScan} | ${e.historicalProfitableHits} | ${e.estimatedOpportunityDensity} | ${e.notes} |`
    );
  }
  lines.push("");

  const likely = rankRoutesByLikelihood(report.densityEstimates);
  lines.push("### Most Likely Arb Locations");
  lines.push("");
  for (const r of likely.filter((x) => x.density !== "none").slice(0, 5)) {
    lines.push(`- **${r.token}**: ${r.maxRoutes} directed DEX pairs, ${r.evaluationsPerScan} evaluations/scan`);
  }
  if (likely.filter((x) => x.density !== "none").length === 0) {
    lines.push("- No high-density candidates in current + probed expansion set");
  }
  lines.push("");

  lines.push("## Alternative Strategies");
  lines.push("");
  lines.push("| Strategy | Profit (1-5) | Effort (1-5) | Capital | Risk | Viability |");
  lines.push("|----------|-------------|-------------|---------|------|-----------|");
  for (const s of report.strategies) {
    lines.push(
      `| ${s.name} | ${s.expectedProfitability} | ${s.engineeringEffort} | ${s.capitalRequirement} | ${s.executionRisk} | ${s.viability} |`
    );
  }
  lines.push("");

  lines.push("## Prioritization Matrix");
  lines.push("");
  lines.push("| Rank | Type | Name | Profit | Effort | Score | Recommendation |");
  lines.push("|------|------|------|--------|--------|-------|----------------|");
  for (const p of report.prioritization.slice(0, 15)) {
    lines.push(
      `| ${p.rank} | ${p.category} | ${p.name} | ${p.expectedProfitability}/5 | ${p.engineeringEffort}/5 | ${p.compositeScore.toFixed(1)} | ${p.recommendation.slice(0, 60)}... |`
    );
  }
  lines.push("");

  lines.push("## Recommended Direction");
  lines.push("");
  lines.push("### Phase 1 — Expand DEX Coverage (Day 29)");
  lines.push("1. Add **PancakeSwap V3** factory + quoter (same pattern as Uniswap)");
  lines.push("2. Re-run scanner with 4 DEXes: Uni, Sushi, Camelot, Pancake");
  lines.push("3. Expected route expansion: 3 DEX pairs → 12 directed pairs per token");
  lines.push("");
  lines.push("### Phase 2 — Expand Token Universe (Day 29-30)");
  lines.push("1. Add GMX, PENDLE, USDT, DAI, MAGIC, RDNT to `tokens.ts`");
  lines.push("2. Add stablecoin pairs for peg arb research");
  lines.push("3. Enable Camelot for all tokens (currently underutilized)");
  lines.push("");
  lines.push("### Phase 3 — Strategy Diversification (Day 30+)");
  lines.push("1. Re-enable triangular scanner on expanded token set");
  lines.push("2. Prototype Curve stableswap quoter for USDC/USDT/DAI");
  lines.push("3. Monitor new Camelot listings for event-driven spreads");
  lines.push("");

  lines.push("## Next Milestone (Day 29)");
  lines.push("");
  lines.push("- [ ] Integrate PancakeSwap V3 discovery + quotes");
  lines.push("- [ ] Add 6 expansion tokens to scanner config");
  lines.push("- [ ] Run 24h live scan on expanded universe");
  lines.push("- [ ] Compare opportunity count: 3 DEX × 5 tokens vs 4 DEX × 11 tokens");
  lines.push("- [ ] Document any non-zero spreads with requote validation");
  lines.push("");

  return lines.join("\n");
}

export async function saveAlphaDiscoveryReport(
  provider: ethers.Provider,
  historical: HistoricalDensity[] = [],
  outputPath = path.join(process.cwd(), "docs/day28_alpha_discovery.md")
): Promise<AlphaDiscoveryReport> {
  const report = await runAlphaDiscovery(provider, historical);
  const markdown = renderMarkdownReport(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown);
  console.log(`\nReport saved to ${outputPath}`);
  return report;
}
