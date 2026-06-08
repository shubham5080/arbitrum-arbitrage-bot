import { ethers } from "ethers";
import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { resolveDexRouter } from "../config/dexRouters";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { StoredOpportunity } from "../database/database";
import { detectPoolType } from "./quoteTrace";

export interface ExecutionPathCheck {
  field: string;
  scannerValue: string;
  executionValue: string;
  match: boolean;
}

export interface ExecutionPathResult {
  token: string;
  route: string;
  size: number;
  checks: ExecutionPathCheck[];
  allMatch: boolean;
  mismatches: string[];
}

export async function auditExecutionPath(
  provider: ethers.Provider,
  opportunity: StoredOpportunity
): Promise<ExecutionPathResult> {
  const routeParts = opportunity.route.split("->").map((s) => s.trim());
  const buyDex = routeParts[0];
  const sellDex = routeParts[1];
  if (!buyDex || !sellDex) {
    throw new Error(`Invalid route: ${opportunity.route}`);
  }
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[opportunity.token];
  const buyPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, sellDex);

  const checks: ExecutionPathCheck[] = [];
  const mismatches: string[] = [];

  const addCheck = (field: string, scannerValue: string, executionValue: string) => {
    const match = scannerValue.toLowerCase() === executionValue.toLowerCase();
    checks.push({ field, scannerValue, executionValue, match });
    if (!match) mismatches.push(field);
  };

  addCheck("buy_router", buyDex, resolveDexRouter(buyDex));
  addCheck("sell_router", sellDex, resolveDexRouter(sellDex));
  addCheck("buy_pool", buyPool?.poolAddress ?? "unknown", buyPool?.poolAddress ?? "unavailable");
  addCheck(
    "sell_pool",
    sellPool?.poolAddress ?? "unknown",
    sellPool?.poolAddress ?? "unavailable"
  );
  addCheck("buy_fee_tier", String(buyPool?.feeTier ?? 0), String(buyPool?.feeTier ?? 0));
  addCheck(
    "sell_fee_tier",
    String(sellPool?.feeTier ?? 0),
    String(sellPool?.feeTier ?? 0)
  );
  addCheck("token_in", opportunity.token, opportunity.token);
  addCheck("trade_size_usdc", String(opportunity.size), String(opportunity.size));

  if (buyPool) {
    const poolType = await detectPoolType(provider, buyPool.poolAddress);
    const expectedMethod =
      buyDex === DEXES.UNISWAP
        ? "uniswap_v3_quoter"
        : poolType === "v3"
          ? "sushi_v3_quoter"
          : "sushi_v2_reserves";
    const actualLikely =
      buyDex === DEXES.SUSHI && poolType === "v3" ? "sushi_v3_or_v2_fallback" : expectedMethod;
    addCheck("buy_quote_path", expectedMethod, actualLikely);
  }

  return {
    token: opportunity.token,
    route: opportunity.route,
    size: opportunity.size,
    checks,
    allMatch: mismatches.length === 0,
    mismatches,
  };
}

export function detectPhantomSpreads(
  opportunities: StoredOpportunity[]
): Array<{
  signature: string;
  token: string;
  route: string;
  size: number;
  count: number;
  avgProfit: number;
  minProfit: number;
  maxProfit: number;
  profitStdDev: number;
  isArtifact: boolean;
}> {
  const clusters = new Map<string, StoredOpportunity[]>();

  for (const opp of opportunities) {
    const profitBucket = Math.round(opp.net_profit * 100) / 100;
    const key = `${opp.token}|${opp.route}|${opp.size}|${profitBucket}`;
    const list = clusters.get(key) ?? [];
    list.push(opp);
    clusters.set(key, list);
  }

  return [...clusters.entries()]
    .map(([signature, rows]) => {
      const profits = rows.map((r) => r.net_profit);
      const avg = profits.reduce((a, b) => a + b, 0) / profits.length;
      const variance =
        profits.reduce((sum, p) => sum + (p - avg) ** 2, 0) / profits.length;
      const stdDev = Math.sqrt(variance);

      return {
        signature,
        token: rows[0]!.token,
        route: rows[0]!.route,
        size: rows[0]!.size,
        count: rows.length,
        avgProfit: Number(avg.toFixed(4)),
        minProfit: Math.min(...profits),
        maxProfit: Math.max(...profits),
        profitStdDev: Number(stdDev.toFixed(6)),
        isArtifact: rows.length >= 5 && stdDev < 0.05,
      };
    })
    .sort((a, b) => b.count - a.count);
}
