import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  initializeDatabase,
  getOpportunitiesSince,
  closeDatabase,
} from "../database/database";
import { buildExecutionDashboard, ExecutionDashboardSummary } from "../analytics/executionDashboard";
import { estimateExecutionGas } from "./gasEstimator";
import { optimizeTradeSizes } from "./tradeSizer";
import { validateRoute } from "./routeValidator";
import { ExecutionPlanRequest, ExecutionPlanResult, RiskScore } from "./executionTypes";
import { calculateFlashFee } from "../utils/feeCalculator";

dotenv.config();

const RPC_URL = process.env.RPC_URL || process.env.ARBITRUM_RPC_URL;
if (!RPC_URL) {
  throw new Error("RPC_URL is required in .env to run execution analysis");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

export async function buildExecutionPlan(
  request: ExecutionPlanRequest
): Promise<ExecutionPlanResult> {
  const validation = await validateRoute(provider, request);
  const estimatedGas = await estimateExecutionGas(provider, request.tradeSize);
  const flashFee = calculateFlashFee(request.tradeSize);
  const expectedNetProfit = Number(
    (request.expectedProfit - estimatedGas.gasCostUSD - flashFee).toFixed(6)
  );
  const sizeEstimates = await optimizeTradeSizes(provider, request);
  const recommendedSize = sizeEstimates.find((estimate) => estimate.executable)?.size;
  const riskScore = scoreRisk(request, validation, estimatedGas);

  return {
    token: request.token,
    route: request.route,
    buyDex: request.buyDex,
    sellDex: request.sellDex,
    tradeSize: request.tradeSize,
    expectedProfit: request.expectedProfit,
    estimatedGas,
    flashFee,
    expectedNetProfit,
    riskScore,
    executable: validation.valid && expectedNetProfit > 0,
    validation,
    ...(recommendedSize !== undefined ? { recommendedSize } : {}),
    sizeEstimates,
  };
}

export async function runExecutionAnalysis(
  windowSeconds = 3600
): Promise<{ plans: ExecutionPlanResult[]; dashboard: ExecutionDashboardSummary }> {
  initializeDatabase();

  const opportunities = getOpportunitiesSince(windowSeconds);
  const plans: ExecutionPlanResult[] = [];

  for (const opportunity of opportunities) {
    const request: ExecutionPlanRequest = {
      token: opportunity.token,
      buyDex: opportunity.dex_buy,
      sellDex: opportunity.dex_sell,
      tradeSize: opportunity.size,
      expectedProfit: opportunity.net_profit,
      route: opportunity.route,
      liquidity: opportunity.liquidity,
      ageSeconds: Math.floor(Date.now() / 1000) - opportunity.timestamp,
      spreadPercent: opportunity.spread_percent,
    };

    const plan = await buildExecutionPlan(request);
    plans.push(plan);
  }

  const dashboard = buildExecutionDashboard(plans);
  closeDatabase();

  return { plans, dashboard };
}

function scoreRisk(
  request: ExecutionPlanRequest,
  validation: { valid: boolean; currentNetProfit: number },
  gasEstimate: { gasCostUSD: number }
): RiskScore {
  let score = 0;

  if (request.liquidity) {
    const liquidity = Number(request.liquidity);
    if (liquidity < 250000) score += 2;
    else if (liquidity < 1000000) score += 1;
  }

  if (request.ageSeconds !== undefined) {
    if (request.ageSeconds > 1200) score += 2;
    else if (request.ageSeconds > 600) score += 1;
  }

  const gasSensitivity = request.expectedProfit > 0 ? gasEstimate.gasCostUSD / request.expectedProfit : 1;
  if (gasSensitivity > 0.15) score += 2;
  else if (gasSensitivity > 0.08) score += 1;

  if (validation.currentNetProfit <= 0) score += 2;
  if (!validation.valid) score += 1;

  const routeComplexity = new Set([request.buyDex, request.sellDex]).size;
  if (routeComplexity > 1) score += 1;
  if (request.buyDex === "CAMELOT" || request.sellDex === "CAMELOT") score += 1;

  if (score <= 2) return "LOW";
  if (score <= 4) return "MEDIUM";
  return "HIGH";
}
