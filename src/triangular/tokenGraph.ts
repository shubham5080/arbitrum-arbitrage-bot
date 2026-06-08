import { TOKENS, TokenSymbol } from "../config/tokens";

export const TRIANGLE_TOKEN_SYMBOLS: TokenSymbol[] = [
  "WETH",
  "ARB",
  "USDC",
  "LINK",
  "UNI",
  "PENDLE",
  "WBTC",
  "GMX",
];

export interface TokenNode {
  symbol: TokenSymbol;
  address: string;
  decimals: number;
}

export interface DirectedEdge {
  from: TokenSymbol;
  to: TokenSymbol;
  label: string;
}

export interface TriangleCycle {
  id: string;
  start: TokenSymbol;
  middle: TokenSymbol;
  end: TokenSymbol;
  label: string;
  legs: [TokenSymbol, TokenSymbol][];
}

export interface TokenGraphReport {
  nodes: TokenNode[];
  edges: DirectedEdge[];
  cycles: TriangleCycle[];
  nodeCount: number;
  edgeCount: number;
  cycleCount: number;
}

export function getTokenNode(symbol: TokenSymbol): TokenNode {
  const t = TOKENS[symbol];
  return { symbol, address: t.address, decimals: t.decimals };
}

export function buildDirectedEdges(symbols: TokenSymbol[] = TRIANGLE_TOKEN_SYMBOLS): DirectedEdge[] {
  const edges: DirectedEdge[] = [];
  for (const from of symbols) {
    for (const to of symbols) {
      if (from === to) continue;
      edges.push({ from, to, label: `${from} → ${to}` });
    }
  }
  return edges;
}

export function generateTriangleCycles(
  symbols: TokenSymbol[] = TRIANGLE_TOKEN_SYMBOLS
): TriangleCycle[] {
  const cycles: TriangleCycle[] = [];

  for (const start of symbols) {
    for (const middle of symbols) {
      if (middle === start) continue;
      for (const end of symbols) {
        if (end === start || end === middle) continue;
        const id = `${start}_${middle}_${end}`;
        cycles.push({
          id,
          start,
          middle,
          end,
          label: `${start} → ${middle} → ${end} → ${start}`,
          legs: [
            [start, middle],
            [middle, end],
            [end, start],
          ],
        });
      }
    }
  }

  return cycles;
}

export function buildTokenGraph(
  symbols: TokenSymbol[] = TRIANGLE_TOKEN_SYMBOLS
): TokenGraphReport {
  const nodes = symbols.map(getTokenNode);
  const edges = buildDirectedEdges(symbols);
  const cycles = generateTriangleCycles(symbols);

  return {
    nodes,
    edges,
    cycles,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    cycleCount: cycles.length,
  };
}

export function filterCycles(
  cycles: TriangleCycle[],
  predicate: (c: TriangleCycle) => boolean
): TriangleCycle[] {
  return cycles.filter(predicate);
}

export function formatTokenGraphMarkdown(graph: TokenGraphReport): string {
  const wethCycles = graph.cycles.filter((c) => c.start === "WETH").length;
  const sample = graph.cycles.slice(0, 12).map((c) => c.label);

  return [
    "## Token Graph",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Nodes (tokens) | ${graph.nodeCount} |`,
    `| Directed edges (swap pairs) | ${graph.edgeCount} |`,
    `| Triangular cycles | ${graph.cycleCount} |`,
    `| WETH-start cycles | ${wethCycles} |`,
    "",
    "**Tokens:** " + graph.nodes.map((n) => n.symbol).join(", "),
    "",
    "### Sample Cycles",
    "",
    ...sample.map((s) => `- ${s}`),
    graph.cycles.length > 12 ? `- … and ${graph.cycles.length - 12} more` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
