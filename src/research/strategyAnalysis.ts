export interface StrategyAssessment {
  id: string;
  name: string;
  description: string;
  expectedProfitability: 1 | 2 | 3 | 4 | 5;
  engineeringEffort: 1 | 2 | 3 | 4 | 5;
  capitalRequirement: "low" | "medium" | "high";
  executionRisk: "low" | "medium" | "high";
  viability: "high" | "medium" | "low" | "research_only";
  notes: string;
}

export function assessAlternativeStrategies(): StrategyAssessment[] {
  return [
    {
      id: "cross_dex_spot",
      name: "Cross-DEX Spot Arbitrage",
      description: "Buy on DEX A, sell on DEX B for same token pair (current scanner model)",
      expectedProfitability: 2,
      engineeringEffort: 2,
      capitalRequirement: "medium",
      executionRisk: "medium",
      viability: "low",
      notes:
        "Day 27 proved current universe is efficient. Edge requires more tokens/DEXes or faster execution than public RPC allows.",
    },
    {
      id: "triangular",
      name: "Triangular Arbitrage",
      description: "USDC → TokenA → TokenB → USDC across 3 legs / 3 DEXes",
      expectedProfitability: 3,
      engineeringEffort: 3,
      capitalRequirement: "medium",
      executionRisk: "high",
      viability: "medium",
      notes:
        "3-leg routes have more price dislocations but compounding slippage + gas. Triangle simulator exists; needs expanded token set.",
    },
    {
      id: "stablecoin",
      name: "Stablecoin Peg Arbitrage",
      description: "USDC/USDT/DAI/FRAX/USDC.e spread capture via Curve/Balancer",
      expectedProfitability: 3,
      engineeringEffort: 4,
      capitalRequirement: "high",
      executionRisk: "low",
      viability: "medium",
      notes:
        "Spreads typically 1-5 bps. Profitable only at scale ($100k+) with low gas. Curve integration required.",
    },
    {
      id: "concentrated_liq",
      name: "Concentrated Liquidity Inefficiencies",
      description: "Exploit tick-range mispricing on Uni V3 / Pancake V3 pools",
      expectedProfitability: 2,
      engineeringEffort: 5,
      capitalRequirement: "medium",
      executionRisk: "high",
      viability: "research_only",
      notes:
        "Requires tick-level simulation and JIT awareness. Dominated by professional market makers.",
    },
    {
      id: "cross_chain",
      name: "Cross-Chain Arbitrage",
      description: "Price differences across Ethereum, Arbitrum, Base, etc.",
      expectedProfitability: 4,
      engineeringEffort: 5,
      capitalRequirement: "high",
      executionRisk: "high",
      viability: "low",
      notes:
        "Bridge latency (minutes) kills most opportunities. Needs inventory on multiple chains.",
    },
    {
      id: "liquidation",
      name: "Liquidation / DeFi Protocol Arb",
      description: "Aave/GMX/Radiant liquidations, bad debt, oracle lag",
      expectedProfitability: 4,
      engineeringEffort: 4,
      capitalRequirement: "high",
      executionRisk: "medium",
      viability: "medium",
      notes:
        "Different skill set from DEX arb. GMX/Radiant on Arbitrum have active liquidation markets. Competes with searchers.",
    },
    {
      id: "lst_basis",
      name: "LST / Restaking Basis",
      description: "wstETH, rETH, cbETH vs WETH spread on Arbitrum",
      expectedProfitability: 3,
      engineeringEffort: 3,
      capitalRequirement: "high",
      executionRisk: "medium",
      viability: "medium",
      notes:
        "Not in current token set. wstETH has deep Uni/Curve liquidity. Basis trades are lower frequency.",
    },
    {
      id: "new_listings",
      name: "New Token / Launch Arb",
      description: "Camelot launchpad, new pool listings with thin liquidity",
      expectedProfitability: 5,
      engineeringEffort: 3,
      capitalRequirement: "low",
      executionRisk: "high",
      viability: "medium",
      notes:
        "Highest raw spreads but extreme adverse selection. Event-driven, not steady-state scanning.",
    },
  ];
}
