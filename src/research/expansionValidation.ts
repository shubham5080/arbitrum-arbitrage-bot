import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { ADDRESSES } from "../config/addresses";
import { SCAN_DEXES } from "../config/dexes";
import { ARBITRAGE_SYMBOLS, TOKENS } from "../config/tokens";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { isPoolTradable } from "../validation/poolValidator";
import { scanMarket, lastScanStats, ScanStats } from "../scanner/scanMarket";
import { Opportunity } from "../types/opportunity";

export interface TokenPoolCoverage {
  symbol: string;
  dexPools: Record<string, boolean>;
  tradableDexCount: number;
  scannable: boolean;
}

export interface ExpansionValidationResult {
  generatedAt: string;
  tokenCoverage: TokenPoolCoverage[];
  scanStats: ScanStats;
  opportunities: Opportunity[];
  profitable: Opportunity[];
  bestByToken: { token: string; count: number; bestNet: number }[];
  bestByDex: { dex: string; routeCount: number; bestNet: number }[];
  priorBaseline: typeof PRIOR_BASELINE;
}

const PRIOR_BASELINE = {
  dexCount: 3 as const,
  tokenCount: 5,
  routesPerScan: 18,
  profitable: 0,
};

export async function verifyTokenPoolCoverage(
  provider: ethers.Provider
): Promise<TokenPoolCoverage[]> {
  const results: TokenPoolCoverage[] = [];

  for (const symbol of ARBITRAGE_SYMBOLS) {
    const dexPools: Record<string, boolean> = {};
    let tradableDexCount = 0;

    for (const dex of SCAN_DEXES) {
      const pool = await getHighestLiquidityPoolForDex(provider, symbol, dex);
      const tradable =
        pool !== null && (await isPoolTradable(provider, pool.poolAddress));
      dexPools[dex] = tradable;
      if (tradable) tradableDexCount += 1;
    }

    results.push({
      symbol,
      dexPools,
      tradableDexCount,
      scannable: tradableDexCount >= 2,
    });
  }

  return results;
}

function rankByToken(opportunities: Opportunity[]) {
  const map = new Map<string, { count: number; bestNet: number }>();
  for (const o of opportunities) {
    const cur = map.get(o.token) ?? { count: 0, bestNet: Number.NEGATIVE_INFINITY };
    cur.count += 1;
    if (o.netProfit > cur.bestNet) cur.bestNet = o.netProfit;
    map.set(o.token, cur);
  }
  return [...map.entries()]
    .map(([token, v]) => ({ token, ...v }))
    .sort((a, b) => b.count - a.count || b.bestNet - a.bestNet);
}

function rankByDex(opportunities: Opportunity[]) {
  const map = new Map<string, { routeCount: number; bestNet: number }>();
  for (const o of opportunities) {
    for (const dex of o.route.split("->").map((s) => s.trim())) {
      const cur = map.get(dex) ?? { routeCount: 0, bestNet: Number.NEGATIVE_INFINITY };
      cur.routeCount += 1;
      if (o.netProfit > cur.bestNet) cur.bestNet = o.netProfit;
      map.set(dex, cur);
    }
  }
  return [...map.entries()]
    .map(([dex, v]) => ({ dex, ...v }))
    .sort((a, b) => b.routeCount - a.routeCount);
}

export async function runExpansionValidation(
  provider: ethers.Provider
): Promise<ExpansionValidationResult> {
  const tokenCoverage = await verifyTokenPoolCoverage(provider);
  const opportunities = await scanMarket();
  const profitable = opportunities.filter((o) => o.netProfit > 0);

  return {
    generatedAt: new Date().toISOString(),
    tokenCoverage,
    scanStats: { ...lastScanStats },
    opportunities,
    profitable,
    bestByToken: rankByToken(opportunities),
    bestByDex: rankByDex(opportunities),
    priorBaseline: PRIOR_BASELINE,
  };
}

export function renderExpansionReport(result: ExpansionValidationResult): string {
  const lines: string[] = [];
  const scannable = result.tokenCoverage.filter((t) => t.scannable);
  const densityIncrease =
    result.scanStats.routesEvaluated / Math.max(result.priorBaseline.routesPerScan, 1);

  lines.push("# Day 29: PancakeSwap Integration & Market Expansion Validation");
  lines.push("");
  lines.push(`**Generated:** ${result.generatedAt}`);
  lines.push("");

  lines.push("## Executive Summary — Success Criteria");
  lines.push("");
  lines.push(
    `1. **Did PancakeSwap create new opportunities?** ${result.profitable.some((o) => o.route.includes("PANCAKESWAP")) ? "Routes involving PancakeSwap exist in scan results" : "No profitable PancakeSwap routes"} — profitable count: **${result.profitable.length}**`
  );
  lines.push(
    `2. **Top token by opportunity count:** **${result.bestByToken[0]?.token ?? "N/A"}** (${result.bestByToken[0]?.count ?? 0} route evaluations)`
  );
  lines.push(
    `3. **Opportunity density increase:** **${densityIncrease.toFixed(1)}x** (${result.priorBaseline.routesPerScan} → ${result.scanStats.routesEvaluated} route evaluations per scan)`
  );
  lines.push(
    `4. **Survived revalidation:** ${result.scanStats.validatedSaved} saved (requote gate rejects: ${result.scanStats.requoteRejected})`
  );
  lines.push(
    `5. **Economically viable routes:** ${result.profitable.length > 0 ? "See profitable table below" : "**None** — all spreads below gas + flash fees"}`
  );
  lines.push(`6. **Add more DEXes?** Curve/Balancer only if pursuing stablecoin peg strategies`);
  lines.push(`7. **Day 30 focus:** ${result.profitable.length === 0 ? "Stablecoin peg research (Curve) or triangular arb on scannable tokens" : "Execution planning on validated routes"}`);
  lines.push("");

  lines.push("## PancakeSwap Integration");
  lines.push("");
  lines.push("| Component | Path |");
  lines.push("|-----------|------|");
  lines.push("| Discovery | `src/discovery/pancakePoolDiscovery.ts` |");
  lines.push("| Quotes | `src/quotes/pancakeV3Quote.ts` |");
  lines.push("| Factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` |");
  lines.push(`| Quoter | \`${ADDRESSES.PANCAKESWAP_V3_QUOTER}\` |`);
  lines.push(`| Router | \`${ADDRESSES.PANCAKESWAP_V3_ROUTER}\` |`);
  lines.push("");
  lines.push("- V3 `quoteExactInputSingle` via Pancake quoter");
  lines.push("- No balanceOf fallback, no synthetic reserves");
  lines.push("- PoolMetadata validation identical to Sushi/Uniswap");
  lines.push("");

  lines.push("## New Token Coverage");
  lines.push("");
  lines.push("| Token | Uni | Sushi | Camelot | Pancake | Tradable DEXes | Scannable |");
  lines.push("|-------|-----|-------|---------|---------|----------------|-----------|");
  for (const t of result.tokenCoverage) {
    const cols = SCAN_DEXES.map((d) => (t.dexPools[d] ? "✅" : "❌"));
    lines.push(
      `| ${(TOKENS as Record<string, { symbol: string }>)[t.symbol]?.symbol ?? t.symbol} | ${cols.join(" | ")} | ${t.tradableDexCount} | ${t.scannable ? "✅" : "❌"} |`
    );
  }
  lines.push("");

  lines.push("## Route Coverage Increase");
  lines.push("");
  lines.push("| Metric | Before (Day 27) | After (Day 29) |");
  lines.push("|--------|-----------------|----------------|");
  lines.push(`| DEXes | 3 | ${SCAN_DEXES.length} |`);
  lines.push(`| Tokens | 5 | ${ARBITRAGE_SYMBOLS.length} |`);
  lines.push(`| Scannable tokens | 1 (WETH) | ${scannable.length} |`);
  lines.push(`| Route evaluations/scan | ~18 | **${result.scanStats.routesEvaluated}** |`);
  lines.push(`| Tokens skipped (insufficient DEXes) | — | ${result.scanStats.tokensSkippedInsufficientDexes} |`);
  lines.push("");

  lines.push("## Opportunity Density");
  lines.push("");
  lines.push("| Token | Directed DEX Pairs |");
  lines.push("|-------|-------------------|");
  for (const [token, pairs] of Object.entries(result.scanStats.dexPairsPerToken)) {
    lines.push(`| ${(TOKENS as Record<string, { symbol: string }>)[token]?.symbol ?? token} | ${pairs} |`);
  }
  lines.push("");
  lines.push(`- Routes evaluated: **${result.scanStats.routesEvaluated}**`);
  lines.push(`- Routes failed (quote errors): **${result.scanStats.routesFailed}**`);
  lines.push(`- Opportunities recorded: **${result.scanStats.opportunitiesFound}**`);
  lines.push(`- Profitable (gross of requote gate): **${result.scanStats.profitableFound}**`);
  lines.push("");

  lines.push("## Revalidation Success Rate");
  lines.push("");
  lines.push("Day 27 requote gate remains enabled:");
  lines.push("- Immediate re-quote must be profitable");
  lines.push("- Profit delta within threshold");
  lines.push("- Net profit ≥ MIN_NET_PROFIT");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Profitable at scan time | ${result.scanStats.profitableFound} |`);
  lines.push(`| Requote rejected | ${result.scanStats.requoteRejected} |`);
  lines.push(`| Validated & saved | ${result.scanStats.validatedSaved} |`);
  lines.push("");

  lines.push("## Token Rankings");
  lines.push("");
  lines.push("| Token | Route Evaluations | Best Net Profit |");
  lines.push("|-------|-------------------|-----------------|");
  for (const t of result.bestByToken.slice(0, 11)) {
    lines.push(
      `| ${(TOKENS as Record<string, { symbol: string }>)[t.token]?.symbol ?? t.token} | ${t.count} | $${t.bestNet.toFixed(4)} |`
    );
  }
  lines.push("");

  lines.push("## DEX Rankings");
  lines.push("");
  lines.push("| DEX | Leg Appearances | Best Net on Leg |");
  lines.push("|-----|-----------------|-----------------|");
  for (const d of result.bestByDex) {
    lines.push(`| ${d.dex} | ${d.routeCount} | $${d.bestNet.toFixed(4)} |`);
  }
  lines.push("");

  lines.push("## New Profitable Opportunities");
  lines.push("");
  if (result.profitable.length === 0) {
    lines.push("**None detected.** Expanded universe shows efficient pricing — spreads remain below execution costs.");
  } else {
    lines.push("| Token | Route | Size | Net Profit |");
    lines.push("|-------|-------|------|------------|");
    for (const o of result.profitable.sort((a, b) => b.netProfit - a.netProfit).slice(0, 20)) {
      lines.push(
        `| ${(TOKENS as Record<string, { symbol: string }>)[o.token]?.symbol ?? o.token} | ${o.route} | $${o.size} | $${o.netProfit.toFixed(4)} |`
      );
    }
  }
  lines.push("");

  if (result.profitable.length > 0) {
    lines.push("### Best Spreads (including unprofitable)");
    lines.push("");
    const best = [...result.opportunities].sort((a, b) => b.netProfit - a.netProfit).slice(0, 10);
    lines.push("| Token | Route | Size | Net | Spread % |");
    lines.push("|-------|-------|------|-----|----------|");
    for (const o of best) {
      lines.push(
        `| ${(TOKENS as Record<string, { symbol: string }>)[o.token]?.symbol ?? o.token} | ${o.route} | $${o.size} | $${o.netProfit.toFixed(4)} | ${o.spreadPercent}% |`
      );
    }
    lines.push("");
  }

  lines.push("## Conclusions");
  lines.push("");
  lines.push(
    `PancakeSwap V3 is fully integrated. Search space grew **${densityIncrease.toFixed(1)}x** ` +
      `(${result.scanStats.routesEvaluated} vs ${result.priorBaseline.routesPerScan} evaluations). ` +
      `${scannable.length} of ${ARBITRAGE_SYMBOLS.length} tokens have ≥2 tradable DEX pools.`
  );
  if (result.profitable.length === 0) {
    lines.push("");
    lines.push(
      "Despite expanded coverage, **no economically viable arbitrage** was detected. " +
        "Markets remain efficient; phantom spreads from Day 26 are not reproduced. " +
        "Next alpha likely requires stablecoin peg strategies (Curve) or event-driven listings."
    );
  }
  lines.push("");

  lines.push("## 24-Hour Research Run");
  lines.push("");
  lines.push("```bash");
  lines.push("npx ts-node src/monitor/liveMonitor.ts");
  lines.push("```");
  lines.push("");
  lines.push("Monitor for 24h to collect time-series opportunity data on the expanded universe.");
  lines.push("");

  return lines.join("\n");
}

export async function saveExpansionValidationReport(
  provider: ethers.Provider,
  outputPath = path.join(process.cwd(), "docs/day29_market_expansion_validation.md")
): Promise<ExpansionValidationResult> {
  const result = await runExpansionValidation(provider);
  const markdown = renderExpansionReport(result);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown);
  console.log(`Report saved to ${outputPath}`);
  return result;
}
