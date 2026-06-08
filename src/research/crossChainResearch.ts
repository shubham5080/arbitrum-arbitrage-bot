export interface CrossChainRoute {
  id: string;
  source: string;
  destination: string;
  bridgeType: string;
  typicalLatency: string;
  bridgeFeeBps: number;
  liquidityFragmentation: "low" | "medium" | "high";
  historicalDivergenceBps: string;
  arbFeasibility: "low" | "medium" | "high";
  notes: string;
}

export interface CrossChainAssessment {
  routes: CrossChainRoute[];
  overallFeasibility: "low" | "medium" | "high";
  summary: string;
}

export function assessCrossChainOpportunities(): CrossChainAssessment {
  const routes: CrossChainRoute[] = [
    {
      id: "arb_base",
      source: "Arbitrum",
      destination: "Base",
      bridgeType: "Canonical (7-day) / Fast (Across, Stargate)",
      typicalLatency: "Fast bridges: 1–15 min; Canonical: 7 days",
      bridgeFeeBps: 5,
      liquidityFragmentation: "high",
      historicalDivergenceBps: "5–20 bps during volatility; <3 bps normal",
      arbFeasibility: "low",
      notes:
        "Fast bridge fees (5–15 bps) consume most stablecoin spreads. Inventory required on both chains. Competing with professional cross-chain searchers.",
    },
    {
      id: "arb_optimism",
      source: "Arbitrum",
      destination: "Optimism",
      bridgeType: "Canonical OP Stack / Across",
      typicalLatency: "Fast: 2–20 min; Canonical: 7 days",
      bridgeFeeBps: 5,
      liquidityFragmentation: "high",
      historicalDivergenceBps: "3–15 bps; OP-native tokens differ",
      arbFeasibility: "low",
      notes:
        "Similar economics to Arbitrum↔Base. Superchain shared sequencing may reduce divergence over time.",
    },
    {
      id: "arb_ethereum",
      source: "Arbitrum",
      destination: "Ethereum",
      bridgeType: "Arbitrum canonical bridge",
      typicalLatency: "Deposit: ~10 min; Withdrawal: 7-day challenge period",
      bridgeFeeBps: 0,
      liquidityFragmentation: "medium",
      historicalDivergenceBps: "10–50 bps on volatile assets during congestion",
      arbFeasibility: "low",
      notes:
        "7-day withdrawal makes inventory-based arb mandatory. ETH/WETH spreads exist but are arbed by market makers with L1+L2 inventory. Flash loans cannot bridge atomically.",
    },
    {
      id: "arb_base_eth",
      source: "Arbitrum",
      destination: "Ethereum (via Base)",
      bridgeType: "Multi-hop bridge",
      typicalLatency: "30+ min",
      bridgeFeeBps: 10,
      liquidityFragmentation: "high",
      historicalDivergenceBps: "Variable",
      arbFeasibility: "low",
      notes: "Multi-hop bridge risk and latency make this unsuitable for systematic arb.",
    },
  ];

  return {
    routes,
    overallFeasibility: "low",
    summary:
      "Cross-chain arbitrage requires pre-positioned inventory on multiple chains, tolerates 1–15 minute bridge latency at 5–15 bps cost, and competes with specialized firms (Across, Stargate searchers). Day 30 showed Arbitrum intra-chain stablecoin spreads of 1–5 bps — insufficient to cover bridge fees. Volatile asset divergence (10–50 bps) exists during stress but is captured by market makers with existing inventory.",
  };
}

export function formatCrossChainMarkdown(assessment: CrossChainAssessment): string {
  const lines = [
    "## Task 4: Cross-Chain Opportunity Research",
    "",
    assessment.summary,
    "",
    "| Route | Bridge | Latency | Bridge Fee | Divergence | Feasibility |",
    "|-------|--------|---------|------------|------------|-------------|",
  ];

  for (const r of assessment.routes) {
    lines.push(
      `| ${r.source} ↔ ${r.destination} | ${r.bridgeType.split(" / ")[0]} | ${r.typicalLatency.split(";")[0]} | ~${r.bridgeFeeBps} bps | ${r.historicalDivergenceBps.split(";")[0]} | **${r.arbFeasibility}** |`
    );
  }

  lines.push(
    "",
    "### Key Constraints",
    "",
    "1. **Flash loans cannot bridge atomically** — capital must be pre-positioned",
    "2. **Bridge latency (1–15 min)** exceeds intra-chain arb windows (<1 block)",
    "3. **Bridge fees (5–15 bps)** exceed observed Arbitrum stablecoin spreads (1–5 bps)",
    "4. **Withdrawal delays (7 days)** on canonical bridges make inventory management costly",
    "5. **Professional competition** — cross-chain searchers operate with dedicated infra",
    "",
    `**Overall feasibility: ${assessment.overallFeasibility.toUpperCase()}**`,
    ""
  );

  return lines.join("\n");
}
