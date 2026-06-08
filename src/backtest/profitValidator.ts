import { RISK } from "../config/risk";
import { ExecutionClassification, ValidationResult } from "./types";

const DEFAULT_MIN_NET_PROFIT = 0.5;
const DEFAULT_MIN_ROI = 0.001; // 0.1%
const DEFAULT_MIN_LIQUIDITY = RISK.MIN_POOL_LIQUIDITY;

export interface ProfitValidatorOptions {
  minNetProfit?: number;
  minRoi?: number;
  minLiquidity?: bigint;
}

export interface ProfitValidatorInput {
  currentProfit: number;
  size: number;
  buyLiquidity: bigint | null;
  sellLiquidity: bigint | null;
}

export function validateProfit(
  input: ProfitValidatorInput,
  options: ProfitValidatorOptions = {}
): ValidationResult {
  const minNetProfit = options.minNetProfit ?? DEFAULT_MIN_NET_PROFIT;
  const minRoi = options.minRoi ?? DEFAULT_MIN_ROI;
  const minLiquidity = options.minLiquidity ?? DEFAULT_MIN_LIQUIDITY;

  const buyLiquidity = input.buyLiquidity ?? 0n;
  const sellLiquidity = input.sellLiquidity ?? 0n;

  if (buyLiquidity < minLiquidity || sellLiquidity < minLiquidity) {
    return {
      classification: "DEAD",
      reason: "low liquidity",
      minNetProfit,
      minRoi,
      minLiquidity,
    };
  }

  if (input.currentProfit <= 0) {
    return {
      classification: "DEAD",
      reason: "spread collapsed or costs consumed profit",
      minNetProfit,
      minRoi,
      minLiquidity,
    };
  }

  const currentRoi = input.currentProfit / input.size;

  if (input.currentProfit < minNetProfit || currentRoi < minRoi) {
    return {
      classification: "MARGINAL",
      reason: "profit positive but below execution thresholds",
      minNetProfit,
      minRoi,
      minLiquidity,
    };
  }

  return {
    classification: "EXECUTABLE",
    reason: "still profitable",
    minNetProfit,
    minRoi,
    minLiquidity,
  };
}
