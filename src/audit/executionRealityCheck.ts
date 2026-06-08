import { ethers } from "ethers";
import { RISK } from "../config/risk";
import { SETTINGS } from "../config/settings";
import { calculateFlashFee } from "../utils/feeCalculator";
import { estimateExecutionGas } from "../execution/gasEstimator";
import { QuoteSnapshot } from "./quoteConsistency";
import { SlippageAuditResult } from "./slippageAuditor";

export type ExecutableStatus = "ACTUALLY_EXECUTABLE" | "NOT_EXECUTABLE";
export type ValidationStatus = "CONFIRMED" | "PARTIAL" | "FALSE_POSITIVE";

const SLIPPAGE_BUFFER_BPS = 50;
const MIN_EXECUTABLE_PROFIT = 0.5;
const LATENCY_SNAPSHOT_MS = 2000;

export interface ExecutionRealityResult {
  executableStatus: ExecutableStatus;
  executable: boolean;
  failureReason: string | null;
  validationStatus: ValidationStatus;
  profitOriginal: number;
  profitRevalidated: number;
  decayPercent: number;
  netAfterLatency: number;
  netAfterSlippageBuffer: number;
  flashFee: number;
  gasCostUsd: number;
  slippageBuffer: number;
}

export function classifyValidation(
  originalNetProfit: number,
  revalidatedNetProfit: number
): ValidationStatus {
  if (revalidatedNetProfit <= 0) {
    return "FALSE_POSITIVE";
  }
  if (revalidatedNetProfit < originalNetProfit) {
    return "PARTIAL";
  }
  return "CONFIRMED";
}

function applySlippageBuffer(profit: number, tradeSize: number): number {
  const buffer = (tradeSize * SLIPPAGE_BUFFER_BPS) / 10_000;
  return Number((profit - buffer).toFixed(6));
}

export async function checkExecutionReality(
  provider: ethers.Provider,
  tradeSize: number,
  originalNetProfit: number,
  snapshots: QuoteSnapshot[],
  slippage: SlippageAuditResult
): Promise<ExecutionRealityResult> {
  const t0 = snapshots.find((s) => s.delayMs === 0);
  const latency = snapshots.find((s) => s.delayMs === LATENCY_SNAPSHOT_MS) ?? t0;
  const profitRevalidated = t0?.gasAdjustedProfit ?? Number.NEGATIVE_INFINITY;
  const validationStatus = classifyValidation(originalNetProfit, profitRevalidated);
  const decayPercent = t0?.profitDecayPercent ?? 100;

  const gasEstimate = await estimateExecutionGas(provider, tradeSize);
  const flashFee = calculateFlashFee(tradeSize);
  const slippageBuffer = Number(((tradeSize * SLIPPAGE_BUFFER_BPS) / 10_000).toFixed(6));

  const netAfterLatency = latency?.gasAdjustedProfit ?? Number.NEGATIVE_INFINITY;
  const netAfterSlippageBuffer = applySlippageBuffer(
    slippage.realisticProfit,
    tradeSize
  );

  let failureReason: string | null = null;
  let executableStatus: ExecutableStatus = "NOT_EXECUTABLE";

  if (slippage.buyLiquidity === "0" && slippage.sellLiquidity === "0") {
    failureReason = "quote mismatch";
  } else if (validationStatus === "FALSE_POSITIVE") {
    failureReason = "quote mismatch";
  } else if (BigInt(slippage.buyLiquidity) < RISK.MIN_POOL_LIQUIDITY) {
    failureReason = "liquidity insufficient";
  } else if (slippage.slippageLoss > originalNetProfit * 0.5) {
    failureReason = "slippage";
  } else if (netAfterLatency <= 0) {
    failureReason = "spread collapsed";
  } else if (gasEstimate.gasCostUSD > originalNetProfit) {
    failureReason = "gas too high";
  } else if (netAfterSlippageBuffer < MIN_EXECUTABLE_PROFIT) {
    failureReason = "spread collapsed";
  } else if (netAfterSlippageBuffer < SETTINGS.MIN_NET_PROFIT) {
    failureReason = "spread collapsed";
  }

  if (!failureReason && netAfterSlippageBuffer >= MIN_EXECUTABLE_PROFIT) {
    executableStatus = "ACTUALLY_EXECUTABLE";
  }

  return {
    executableStatus,
    executable: executableStatus === "ACTUALLY_EXECUTABLE",
    failureReason,
    validationStatus,
    profitOriginal: originalNetProfit,
    profitRevalidated,
    decayPercent,
    netAfterLatency,
    netAfterSlippageBuffer,
    flashFee,
    gasCostUsd: gasEstimate.gasCostUSD,
    slippageBuffer,
  };
}
