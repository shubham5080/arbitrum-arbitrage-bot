import { ethers } from "ethers";
import {
  buildTokenGraph,
  TriangleCycle,
  filterCycles,
  TRIANGLE_TOKEN_SYMBOLS,
} from "./tokenGraph";
import {
  expandCycleDexRoutes,
  DexPermutationRoute,
  TRIANGLE_DEXES,
  countRoutes,
} from "./dexPermutations";
import {
  simulateTriangleRoute,
  TRADE_SIZES_USD,
  TriangleSimulationResult,
} from "./triangleProfitability";
import {
  initializeTriangularTables,
  saveTriangularOpportunity,
} from "./triangularDatabase";
import { clearPoolCache } from "./pairPoolDiscovery";

export const PRIORITY_CYCLE_IDS = [
  "WETH_ARB_USDC",
  "WETH_LINK_USDC",
  "WETH_UNI_USDC",
  "WETH_PENDLE_USDC",
  "WETH_ARB_LINK",
  "WETH_UNI_ARB",
  "WETH_USDC_ARB",
  "WETH_USDC_LINK",
];

export interface TriangleScanOptions {
  /** Which cycles to evaluate */
  cycles?: TriangleCycle[];
  /** USD trade sizes */
  sizes?: number[];
  /** Limit to WETH-start cycles only */
  wethStartOnly?: boolean;
  /** Specific cycle IDs */
  cycleIds?: string[];
  /** Save every result to DB */
  persist?: boolean;
  /** Progress callback */
  onProgress?: (done: number, total: number, last?: TriangleSimulationResult) => void;
}

export interface TriangleScanReport {
  graph: ReturnType<typeof buildTokenGraph>;
  totalRoutesInUniverse: number;
  routesEvaluated: number;
  quotesSucceeded: number;
  quotesFailed: number;
  profitable: number;
  nearBreakEven: number;
  results: TriangleSimulationResult[];
  best: TriangleSimulationResult | null;
}

function resolveCycles(options: TriangleScanOptions): TriangleCycle[] {
  const graph = buildTokenGraph(TRIANGLE_TOKEN_SYMBOLS);
  let cycles = options.cycles ?? graph.cycles;

  if (options.cycleIds?.length) {
    const idSet = new Set(options.cycleIds);
    cycles = cycles.filter((c) => idSet.has(c.id));
  } else if (options.wethStartOnly) {
    cycles = filterCycles(cycles, (c) => c.start === "WETH");
  }

  return cycles;
}

export function buildRouteManifest(cycles: TriangleCycle[]): {
  routes: DexPermutationRoute[];
  totalRoutes: number;
} {
  const routes = expandCycleDexRoutes(cycles, TRIANGLE_DEXES);
  return { routes, totalRoutes: countRoutes(cycles.length, TRIANGLE_DEXES.length) };
}

export async function runTriangleScan(
  provider: ethers.Provider,
  options: TriangleScanOptions = {}
): Promise<TriangleScanReport> {
  if (options.persist !== false) {
    initializeTriangularTables();
  }

  const graph = buildTokenGraph(TRIANGLE_TOKEN_SYMBOLS);
  const cycles = resolveCycles(options);
  const sizes = options.sizes ?? [...TRADE_SIZES_USD];
  const routes = expandCycleDexRoutes(cycles, TRIANGLE_DEXES);

  const results: TriangleSimulationResult[] = [];
  let quotesSucceeded = 0;
  let quotesFailed = 0;
  let profitable = 0;
  let nearBreakEven = 0;
  let best: TriangleSimulationResult | null = null;

  const total = routes.length * sizes.length;
  let done = 0;

  for (const route of routes) {
    const cycle = cycles.find((c) => c.id === route.cycleId)!;
    for (const size of sizes) {
      const result = await simulateTriangleRoute(provider, {
        cycle,
        dexPath: route.dexPath,
        startAmountUsd: size,
      });

      results.push(result);
      done += 1;

      if (result.quoteSuccess) {
        quotesSucceeded += 1;
        if (result.executable) profitable += 1;
        if (result.netProfit > -2 && result.netProfit <= 0) nearBreakEven += 1;
        if (!best || result.netProfit > best.netProfit) best = result;
      } else {
        quotesFailed += 1;
      }

      if (options.persist !== false) {
        saveTriangularOpportunity(result);
      }

      options.onProgress?.(done, total, result);
    }
  }

  clearPoolCache();

  return {
    graph,
    totalRoutesInUniverse: countRoutes(graph.cycleCount, TRIANGLE_DEXES.length),
    routesEvaluated: total,
    quotesSucceeded,
    quotesFailed,
    profitable,
    nearBreakEven,
    results,
    best,
  };
}

export async function runPriorityTriangleScan(
  provider: ethers.Provider,
  persist = true
): Promise<TriangleScanReport> {
  return runTriangleScan(provider, {
    cycleIds: PRIORITY_CYCLE_IDS,
    sizes: [...TRADE_SIZES_USD],
    persist,
    onProgress: (done, total, last) => {
      if (done % 50 === 0 || done === total) {
        const net = last?.quoteSuccess ? last.netProfit.toFixed(2) : "—";
        console.log(`[triangle] ${done}/${total} last net=$${net}`);
      }
    },
  });
}

export async function runWethTriangleScan(
  provider: ethers.Provider,
  sizes: number[] = [10_000],
  persist = true
): Promise<TriangleScanReport> {
  return runTriangleScan(provider, {
    wethStartOnly: true,
    sizes,
    persist,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) {
        console.log(`[triangle] WETH scan ${done}/${total}`);
      }
    },
  });
}
