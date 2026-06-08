import { TOKENS } from "../config/tokens";
import {
  CANDIDATE_TOKENS,
  ResearchToken,
  SCANNED_TOKEN_SYMBOLS,
} from "./arbitrumUniverse";
import { PoolLiquidityRank } from "./liquidityRanking";

export interface TokenCoverageResult {
  scanned: string[];
  missing: ResearchToken[];
  expansionCandidates: TokenExpansionRank[];
}

export interface TokenExpansionRank {
  symbol: string;
  address: string;
  category: string;
  volumeTier: number;
  dexCount: number;
  maxLiquidity: bigint;
  bestDex: string | null;
  score: number;
  rationale: string;
}

export function auditTokenCoverage(liquidityRanks: PoolLiquidityRank[]): TokenCoverageResult {
  const scanned = Object.keys(TOKENS);
  const scannedSet = new Set(SCANNED_TOKEN_SYMBOLS);

  const missing = CANDIDATE_TOKENS.filter(
    (t) => !scannedSet.has(t.symbol as (typeof SCANNED_TOKEN_SYMBOLS)[number])
  );

  const byToken = new Map<string, PoolLiquidityRank[]>();
  for (const rank of liquidityRanks) {
    const list = byToken.get(rank.token) ?? [];
    list.push(rank);
    byToken.set(rank.token, list);
  }

  const expansionCandidates: TokenExpansionRank[] = missing.map((token) => {
    const pools = byToken.get(token.symbol) ?? [];
    const dexCount = pools.length;
    const maxLiq = pools.reduce((max, p) => (p.liquidity > max ? p.liquidity : max), 0n);
    const best = pools[0] ?? null;

    // Score: liquidity depth + DEX coverage + volume tier
    const liqScore = maxLiq > 0n ? Math.min(40, Number(maxLiq / 10n ** 18n)) : 0;
    const dexScore = dexCount * 15;
    const volScore = token.volumeTier * 8;
    const score = liqScore + dexScore + volScore;

    let rationale = "";
    if (dexCount >= 3) rationale = "Multi-DEX coverage — cross-DEX arb possible";
    else if (dexCount === 2) rationale = "Two DEX pools — limited route pairs";
    else if (dexCount === 1) rationale = "Single DEX only — no cross-DEX arb without expansion";
    else rationale = "No USDC pool found on probed DEXes";

    return {
      symbol: token.symbol,
      address: token.address,
      category: token.category,
      volumeTier: token.volumeTier,
      dexCount,
      maxLiquidity: maxLiq,
      bestDex: best?.dex ?? null,
      score,
      rationale,
    };
  });

  expansionCandidates.sort((a, b) => b.score - a.score);

  return { scanned, missing, expansionCandidates };
}
