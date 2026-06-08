import {
  getTriangularOpportunitiesSince,
  getTriangularRouteFrequency,
  getTopTriangularByNetProfit,
  StoredTriangularOpportunity,
} from "./triangularDatabase";
import { FLASH_FEE_RATE } from "./triangleProfitability";

export interface ReplayAssumptions {
  gasUsd: number;
  flashFeeRate: number;
  label: string;
}

export const REPLAY_SCENARIOS: ReplayAssumptions[] = [
  { gasUsd: 0.03, flashFeeRate: 0.0005, label: "Optimistic (5 bps flash, low gas)" },
  { gasUsd: 0.05, flashFeeRate: 0.0009, label: "Baseline (9 bps flash)" },
  { gasUsd: 0.10, flashFeeRate: 0.0009, label: "Conservative (high gas)" },
  { gasUsd: 0.05, flashFeeRate: 0.0015, label: "Pessimistic (15 bps flash)" },
];

export interface ReplayResult {
  scenario: string;
  profitable: number;
  breakEven: number;
  unprofitable: number;
  maxNet: number;
  avgNet: number;
}

export interface TriangleReplayAnalysis {
  windowHours: number;
  totalSnapshots: number;
  scenarios: ReplayResult[];
  topRoutes: StoredTriangularOpportunity[];
  frequentRoutes: ReturnType<typeof getTriangularRouteFrequency>;
  nearBreakEvenRoutes: StoredTriangularOpportunity[];
  persistenceVerdict: string;
}

function recalcNet(opp: StoredTriangularOpportunity, assumptions: ReplayAssumptions): number {
  const gross = opp.end_amount_usd - opp.start_amount_usd;
  const flash = opp.start_amount_usd * assumptions.flashFeeRate;
  return gross - assumptions.gasUsd - flash;
}

export function analyzeTriangleReplay(secondsAgo = 24 * 3600): TriangleReplayAnalysis {
  const opps = getTriangularOpportunitiesSince(secondsAgo);
  const quoted = opps.filter((o) => o.quote_success === 1);

  const scenarios: ReplayResult[] = REPLAY_SCENARIOS.map((scenario) => {
    let profitable = 0;
    let breakEven = 0;
    let unprofitable = 0;
    let maxNet = -Infinity;
    let sum = 0;

    for (const o of quoted) {
      const net = recalcNet(o, scenario);
      sum += net;
      maxNet = Math.max(maxNet, net);
      if (net > 0.01) profitable += 1;
      else if (Math.abs(net) <= 0.01) breakEven += 1;
      else unprofitable += 1;
    }

    return {
      scenario: scenario.label,
      profitable,
      breakEven,
      unprofitable,
      maxNet: quoted.length ? Number(maxNet.toFixed(4)) : 0,
      avgNet: quoted.length ? Number((sum / quoted.length).toFixed(4)) : 0,
    };
  });

  const topRoutes = getTopTriangularByNetProfit(10);
  const frequentRoutes = getTriangularRouteFrequency().slice(0, 10);
  const nearBreakEvenRoutes = quoted
    .filter((o) => o.net_profit > -2 && o.net_profit <= 0)
    .sort((a, b) => b.net_profit - a.net_profit)
    .slice(0, 10);

  const anyProfitableInAnyScenario = scenarios.some((s) => s.profitable > 0);
  const repeatableNearBe = frequentRoutes.filter((r) => r.count >= 3 && r.max_net > -2).length;

  let persistenceVerdict: string;
  if (anyProfitableInAnyScenario && repeatableNearBe > 0) {
    persistenceVerdict =
      "Some routes show repeatable near-break-even or positive replay under certain assumptions — continue monitoring.";
  } else if (repeatableNearBe > 0) {
    persistenceVerdict =
      "Near-break-even routes repeat but do not survive fee assumptions — likely structural spread, not arb.";
  } else {
    persistenceVerdict =
      "No repeatable profitable pattern detected — opportunities appear to be quote noise or random variance.";
  }

  const windowHours =
    quoted.length >= 2
      ? ((quoted[quoted.length - 1]!.timestamp - quoted[0]!.timestamp) / 3600).toFixed(2)
      : "0";

  return {
    windowHours: Number(windowHours),
    totalSnapshots: opps.length,
    scenarios,
    topRoutes,
    frequentRoutes,
    nearBreakEvenRoutes,
    persistenceVerdict,
  };
}

export function formatReplayMarkdown(analysis: TriangleReplayAnalysis): string {
  const lines = [
    "## Historical Replay & Persistence",
    "",
    `Collection window: **${analysis.windowHours}h** | Snapshots: **${analysis.totalSnapshots}**`,
    "",
    "### Fee Scenario Replay",
    "",
    "| Scenario | Profitable | Break-Even | Unprofitable | Max Net ($) | Avg Net ($) |",
    "|----------|------------|------------|--------------|-------------|-------------|",
  ];

  for (const s of analysis.scenarios) {
    lines.push(
      `| ${s.scenario} | ${s.profitable} | ${s.breakEven} | ${s.unprofitable} | $${s.maxNet.toFixed(2)} | $${s.avgNet.toFixed(2)} |`
    );
  }

  lines.push(
    "",
    "### Most Profitable Routes (stored)",
    "",
    "| Route | DEX Path | Net ($) | Size ($) |",
    "|-------|----------|---------|----------|"
  );

  for (const r of analysis.topRoutes.slice(0, 8)) {
    lines.push(
      `| ${r.route} | ${r.dex_path} | $${r.net_profit.toFixed(2)} | $${r.start_amount_usd.toLocaleString()} |`
    );
  }

  lines.push(
    "",
    "### Near Break-Even Routes",
    "",
    "| Route | DEX Path | Net ($) |",
    "|-------|----------|---------|"
  );

  for (const r of analysis.nearBreakEvenRoutes.slice(0, 6)) {
    lines.push(`| ${r.route} | ${r.dex_path} | $${r.net_profit.toFixed(2)} |`);
  }

  lines.push("", `**Persistence verdict:** ${analysis.persistenceVerdict}`, "");

  return lines.join("\n");
}
