import { ethers } from "ethers";
import { validateRoute } from "./routeValidator";
import { estimateExecutionGas } from "./gasEstimator";
import { calculateFlashFee } from "../utils/feeCalculator";
import { ExecutionPlanRequest, TradeSizeEstimate } from "./executionTypes";

const DEFAULT_SIZES = [100, 250, 500, 1000, 2500, 5000];

export async function optimizeTradeSizes(
  provider: ethers.Provider,
  request: ExecutionPlanRequest,
  candidateSizes: number[] = DEFAULT_SIZES
) {
  const estimates: TradeSizeEstimate[] = [];

  for (const size of candidateSizes) {
    const sizedRequest: ExecutionPlanRequest = {
      ...request,
      tradeSize: size,
      expectedProfit:
        request.tradeSize > 0
          ? (request.expectedProfit * size) / request.tradeSize
          : request.expectedProfit,
    };

    const validation = await validateRoute(provider, sizedRequest);
    const gasEstimate = await estimateExecutionGas(provider, size);
    const slippageImpact = calculateSlippageImpact(size, request);
    const expectedReturn = Number(
      (validation.currentNetProfit + gasEstimate.gasCostUSD + gasEstimate.flashFee).toFixed(6)
    );
    const finalProfit = validation.currentNetProfit;

    estimates.push({
      size,
      expectedReturn,
      slippageImpact,
      gasImpact: gasEstimate.gasCostUSD,
      finalProfit,
      executable: validation.valid,
      estimatedNetProfit: finalProfit,
    });
  }

  return estimates.sort((a, b) => b.finalProfit - a.finalProfit);
}

function calculateSlippageImpact(size: number, request: ExecutionPlanRequest) {
  const baselineSlip = request.spreadPercent ? Math.max(0, request.spreadPercent * 0.1) : 0.1;
  const scaledSlip = (size / 1000) * 0.15;
  return Number((baselineSlip + scaledSlip).toFixed(4));
}
