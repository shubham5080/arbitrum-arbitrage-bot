import { ethers } from "ethers";

export type RiskScore = "LOW" | "MEDIUM" | "HIGH";

export interface ExecutionPlanRequest {
  token: string;
  buyDex: string;
  sellDex: string;
  tradeSize: number;
  expectedProfit: number;
  route: string;
  liquidity?: string;
  ageSeconds?: number;
  spreadPercent?: number;
}

export interface GasEstimate {
  gasUsed: number;
  gasCostUSD: number;
  flashFee: number;
  profitAfterGas: number;
  gasPriceGwei: number;
  estimatedGasPriceWei: bigint;
  estimatedWethPriceUsdc: number;
}

export interface RouteValidationResult {
  valid: boolean;
  reason: string;
  poolExists: boolean;
  liquiditySufficient: boolean;
  spreadValid: boolean;
  profitStillPositive: boolean;
  currentNetProfit: number;
  currentSpreadPercent: number;
}

export interface TradeSizeEstimate {
  size: number;
  expectedReturn: number;
  slippageImpact: number;
  gasImpact: number;
  finalProfit: number;
  executable: boolean;
  estimatedNetProfit: number;
}

export interface ExecutionPlanResult {
  token: string;
  route: string;
  buyDex: string;
  sellDex: string;
  tradeSize: number;
  expectedProfit: number;
  estimatedGas: GasEstimate;
  flashFee: number;
  expectedNetProfit: number;
  riskScore: RiskScore;
  executable: boolean;
  validation: RouteValidationResult;
  recommendedSize?: number;
  sizeEstimates?: TradeSizeEstimate[];
}
