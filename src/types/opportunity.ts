import { PoolType } from "./poolMetadata";

export interface Opportunity {
  token: string;
  route: string;
  size: number;

  grossProfit: number;
  gasCost: number;
  flashFee: number;
  netProfit: number;
  score: number;

  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  slippageImpact: number;

  // Day 17: Profit Attribution (in USDC)
  spreadContribution: number; // Theoretical profit from spread: (sellPrice - buyPrice) * tokenAmount
  gasContribution: number; // -gasCost
  flashContribution: number; // -flashFee
  executionContribution: number; // grossProfit - spreadContribution (slippage/MEV/other)

  liquidity: string;
  feeTier: number;
  poolAddress: string;
  poolType?: PoolType;
  sellPoolAddress?: string;
  sellPoolType?: PoolType;
  sellFeeTier?: number;
}
