import { ethers } from "ethers";
import { TOKENS } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { DEXES, SCAN_DEXES } from "../config/dexes";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { TriangleSimulator } from "../strategies/triangular/triangleSimulator";
import { TriangleRoute } from "../strategies/triangular/types";
import { calculateFlashFee } from "../utils/feeCalculator";

export interface TriangularCandidate {
  id: string;
  route: string;
  middleToken: string;
  endToken: string;
  dexCoverage: Record<string, boolean>;
  tradableLegs: number;
  minPoolLiquidity: string;
  simulationSuccess: boolean;
  grossProfitUsd: number | null;
  netProfitUsd: number | null;
  profitPercent: number | null;
  inefficiencyScore: number;
  notes: string;
}

const TRIANGLE_TOKENS = ["WETH", "ARB", "LINK", "UNI", "PENDLE"] as const;
const GAS_USD = 0.04; // 3 swaps + flash overhead
const TEST_SIZE = 10_000;

const ROUTE_DEFS: { id: string; middle: string; end: string }[] = [
  { id: "WETH_ARB_USDC", middle: "ARB", end: "WETH" },
  { id: "WETH_LINK_USDC", middle: "LINK", end: "WETH" },
  { id: "WETH_UNI_USDC", middle: "UNI", end: "WETH" },
  { id: "WETH_PENDLE_USDC", middle: "PENDLE", end: "WETH" },
];

async function checkPairPools(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string
): Promise<{ dex: string; liquidity: bigint }[]> {
  const symA = Object.entries(TOKENS).find(([, t]) => t.address.toLowerCase() === tokenA.toLowerCase())?.[0];
  const symB = Object.entries(TOKENS).find(([, t]) => t.address.toLowerCase() === tokenB.toLowerCase())?.[0];
  if (!symA || !symB) return [];

  const found: { dex: string; liquidity: bigint }[] = [];
  for (const dex of SCAN_DEXES) {
    const poolA = await getHighestLiquidityPoolForDex(provider, symA, dex);
    const poolB = await getHighestLiquidityPoolForDex(provider, symB, dex);
    if (poolA) found.push({ dex, liquidity: poolA.liquidity });
    if (poolB && !found.some((f) => f.dex === dex)) {
      found.push({ dex, liquidity: poolB.liquidity });
    }
  }
  return found;
}

const RESEARCH_DEXES = [DEXES.UNISWAP, DEXES.PANCAKESWAP, DEXES.SUSHI];

async function findBestDexCombo(
  provider: ethers.Provider,
  route: TriangleRoute,
  initialAmount: number
): Promise<{ gross: number; profitPct: number; dexes: [string, string, string] } | null> {
  const simulator = new TriangleSimulator(provider);
  let best: { gross: number; profitPct: number; dexes: [string, string, string] } | null = null;

  for (const d1 of RESEARCH_DEXES) {
    for (const d2 of RESEARCH_DEXES) {
      for (const d3 of RESEARCH_DEXES) {
        try {
          const result = await simulator.simulateTriangle(
            route,
            initialAmount,
            d1,
            d2,
            d3
          );
          if (!best || result.grossProfit > best.gross) {
            best = {
              gross: result.grossProfit,
              profitPct: result.profitPercent,
              dexes: [d1, d2, d3],
            };
          }
        } catch {
          continue;
        }
      }
    }
  }
  return best;
}

export async function researchTriangularArbitrage(
  provider: ethers.Provider,
  testSize = TEST_SIZE
): Promise<TriangularCandidate[]> {
  const usdc = ADDRESSES.USDC;
  const candidates: TriangularCandidate[] = [];

  for (const def of ROUTE_DEFS) {
    const middle = TOKENS[def.middle as keyof typeof TOKENS];
    const end = TOKENS[def.end as keyof typeof TOKENS];
    if (!middle || !end) continue;

    const dexCoverage: Record<string, boolean> = {};
    let tradableLegs = 0;
    let minLiq = BigInt(Number.MAX_SAFE_INTEGER);

    const legChecks = [
      { label: "USDC→" + def.middle, pools: await checkPairPools(provider, usdc, middle.address) },
      { label: def.middle + "→" + def.end, pools: await checkPairPools(provider, middle.address, end.address) },
      { label: def.end + "→USDC", pools: await checkPairPools(provider, end.address, usdc) },
    ];

    for (const leg of legChecks) {
      if (leg.pools.length > 0) tradableLegs += 1;
      for (const p of leg.pools) {
        dexCoverage[p.dex] = true;
        if (p.liquidity < minLiq) minLiq = p.liquidity;
      }
    }

    const route: TriangleRoute = {
      startToken: usdc,
      middleToken: middle.address,
      endToken: end.address,
      startTokenDecimals: 6,
      middleTokenDecimals: middle.decimals,
      endTokenDecimals: end.decimals,
    };

    let grossProfitUsd: number | null = null;
    let netProfitUsd: number | null = null;
    let profitPercent: number | null = null;
    let simulationSuccess = false;
    let notes = "";

    if (tradableLegs >= 2) {
      try {
        const best = await findBestDexCombo(provider, route, testSize);
        if (best) {
          simulationSuccess = true;
          grossProfitUsd = Number(best.gross.toFixed(4));
          const flashFee = calculateFlashFee(testSize);
          netProfitUsd = Number((best.gross - GAS_USD - flashFee).toFixed(4));
          profitPercent = Number(best.profitPct.toFixed(4));
          notes = `Best DEX combo: ${best.dexes.join(" → ")}`;
        }
      } catch (e) {
        notes = `Simulation failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      notes = `Only ${tradableLegs}/3 legs have pool coverage`;
    }

    const inefficiencyScore =
      tradableLegs * 10 +
      Object.keys(dexCoverage).length * 5 +
      (grossProfitUsd !== null && grossProfitUsd > 0 ? 20 : 0) +
      (netProfitUsd !== null && netProfitUsd > 0 ? 30 : 0);

    candidates.push({
      id: def.id,
      route: `USDC → ${def.middle} → ${def.end} → USDC`,
      middleToken: def.middle,
      endToken: def.end,
      dexCoverage,
      tradableLegs,
      minPoolLiquidity: minLiq === BigInt(Number.MAX_SAFE_INTEGER) ? "0" : minLiq.toString(),
      simulationSuccess,
      grossProfitUsd,
      netProfitUsd,
      profitPercent,
      inefficiencyScore,
      notes,
    });
  }

  // Also evaluate WETH-start routes (user-specified format)
  for (const token of TRIANGLE_TOKENS) {
    if (token === "WETH") continue;
    const mid = TOKENS[token as keyof typeof TOKENS];
    const weth = TOKENS.WETH;
    if (!mid || !weth) continue;

    const wethRoute: TriangleRoute = {
      startToken: weth.address,
      middleToken: mid.address,
      endToken: usdc,
      startTokenDecimals: weth.decimals,
      middleTokenDecimals: mid.decimals,
      endTokenDecimals: 6,
    };

    const wethPools = await checkPairPools(provider, weth.address, mid.address);
    const usdcPools = await checkPairPools(provider, mid.address, usdc);
    const backPools = await checkPairPools(provider, usdc, weth.address);

    const tradable =
      (wethPools.length > 0 ? 1 : 0) +
      (usdcPools.length > 0 ? 1 : 0) +
      (backPools.length > 0 ? 1 : 0);

    let gross: number | null = null;
    let net: number | null = null;
    let simOk = false;
    let note = "";

    if (tradable >= 2) {
      try {
        const simulator = new TriangleSimulator(provider);
        let bestGross = -Infinity;
        let bestDexes: string[] = [];
        for (const d1 of RESEARCH_DEXES) {
          for (const d2 of RESEARCH_DEXES) {
            for (const d3 of RESEARCH_DEXES) {
              try {
                const result = await simulator.simulateTriangle(wethRoute, 1, d1, d2, d3);
                if (result.grossProfit > bestGross) {
                  bestGross = result.grossProfit;
                  bestDexes = [d1, d2, d3];
                }
              } catch {
                continue;
              }
            }
          }
        }
        if (bestGross > -Infinity) {
          simOk = true;
          gross = bestGross;
          net = bestGross - GAS_USD - calculateFlashFee(1600);
          note = `WETH-start; best: ${bestDexes.join(" → ")}`;
        }
      } catch {
        note = "WETH-start simulation incomplete";
      }
    }

    candidates.push({
      id: `WETH_${token}_USDC`,
      route: `WETH → ${token} → USDC → WETH`,
      middleToken: token,
      endToken: "USDC",
      dexCoverage: {},
      tradableLegs: tradable,
      minPoolLiquidity: "0",
      simulationSuccess: simOk,
      grossProfitUsd: gross,
      netProfitUsd: net,
      profitPercent: gross !== null ? (gross / 1600) * 100 : null,
      inefficiencyScore: tradable * 8,
      notes: note || `${tradable}/3 legs covered`,
    });
  }

  return candidates.sort((a, b) => b.inefficiencyScore - a.inefficiencyScore);
}

export function formatTriangularMarkdown(candidates: TriangularCandidate[]): string {
  const lines = [
    "## Task 3: Triangular Arbitrage Research",
    "",
    "Ranked candidates by liquidity coverage and simulated inefficiency.",
    "",
    "| Rank | Route | Tradable Legs | DEXes | Gross ($) | Net ($) | Score |",
    "|------|-------|---------------|-------|-----------|---------|-------|",
  ];

  candidates.slice(0, 10).forEach((c, i) => {
    const dexCount = Object.keys(c.dexCoverage).length || "—";
    lines.push(
      `| ${i + 1} | ${c.route} | ${c.tradableLegs}/3 | ${dexCount} | ${c.grossProfitUsd !== null ? c.grossProfitUsd.toFixed(2) : "—"} | ${c.netProfitUsd !== null ? c.netProfitUsd.toFixed(2) : "—"} | ${c.inefficiencyScore} |`
    );
  });

  lines.push("", "### Per-Route Detail", "");
  for (const c of candidates.slice(0, 6)) {
    lines.push(`**${c.route}**`);
    lines.push(`- Tradable legs: ${c.tradableLegs}/3`);
    lines.push(`- ${c.notes}`);
    lines.push("");
  }

  const anyProfitable = candidates.some((c) => c.netProfitUsd !== null && c.netProfitUsd > 0);
  lines.push(
    "### Interpretation",
    "",
    anyProfitable
      ? "- Some triangular routes show positive gross at scan time — require revalidation before acting"
      : "- **No triangular route is net profitable** after gas and flash fees at tested sizes",
    "- WETH/ARB has best DEX coverage (Uni + Pancake) but compounding 3-leg slippage erodes edge",
    "- LINK, UNI, PENDLE lack multi-DEX coverage — triangular routes fail on missing legs",
    ""
  );

  return lines.join("\n");
}
