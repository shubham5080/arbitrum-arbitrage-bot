import { DEXES, DexId } from "../config/dexes";
import { TriangleCycle } from "./tokenGraph";

export const TRIANGLE_DEXES: DexId[] = [
  DEXES.UNISWAP,
  DEXES.SUSHI,
  DEXES.PANCAKESWAP,
  DEXES.CAMELOT,
];

export interface DexPermutationRoute {
  cycleId: string;
  cycleLabel: string;
  dexPath: [DexId, DexId, DexId];
  dexPathLabel: string;
}

export function generateDexPermutations(dexes: DexId[] = TRIANGLE_DEXES): [DexId, DexId, DexId][] {
  const perms: [DexId, DexId, DexId][] = [];
  for (const d1 of dexes) {
    for (const d2 of dexes) {
      for (const d3 of dexes) {
        perms.push([d1, d2, d3]);
      }
    }
  }
  return perms;
}

export function expandCycleDexRoutes(
  cycles: TriangleCycle[],
  dexes: DexId[] = TRIANGLE_DEXES
): DexPermutationRoute[] {
  const perms = generateDexPermutations(dexes);
  const routes: DexPermutationRoute[] = [];

  for (const cycle of cycles) {
    for (const dexPath of perms) {
      routes.push({
        cycleId: cycle.id,
        cycleLabel: cycle.label,
        dexPath,
        dexPathLabel: dexPath.join(" → "),
      });
    }
  }

  return routes;
}

export function countRoutes(cycleCount: number, dexCount = TRIANGLE_DEXES.length): number {
  return cycleCount * Math.pow(dexCount, 3);
}

export function formatDexPermutationMarkdown(
  cycleCount: number,
  dexCount = TRIANGLE_DEXES.length
): string {
  const permsPerCycle = Math.pow(dexCount, 3);
  const total = countRoutes(cycleCount, dexCount);

  return [
    "## DEX Permutation Engine",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| DEXes | ${dexCount} (${TRIANGLE_DEXES.join(", ")}) |`,
    `| Permutations per triangle | ${permsPerCycle} (${dexCount}³) |`,
    `| Triangular cycles | ${cycleCount} |`,
    `| **Total routes** | **${total.toLocaleString()}** |`,
    "",
    "### Example Permutations (WETH → ARB → USDC → WETH)",
    "",
    "| Leg 1 | Leg 2 | Leg 3 |",
    "|-------|-------|-------|",
    "| UNISWAP | UNISWAP | UNISWAP |",
    "| UNISWAP | SUSHI | PANCAKESWAP |",
    "| SUSHI | UNISWAP | PANCAKESWAP |",
    "| CAMELOT | PANCAKESWAP | UNISWAP |",
    "",
  ].join("\n");
}
