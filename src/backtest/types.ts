import { StoredOpportunity } from "../database/database";

export type ExecutionClassification = "EXECUTABLE" | "MARGINAL" | "DEAD";

export interface ReplayResult {
  opportunityKey: string;
  opportunityId?: number;
  token: string;
  route: string;
  size: number;
  delaySeconds: number;
  originalProfit: number;
  currentProfit: number;
  profitDifference: number;
  profitChangePct: number;
  classification: ExecutionClassification;
  reason: string;
  executable: boolean;
  buyLiquidity: string | null;
  sellLiquidity: string | null;
  isStillProfitable: boolean;
  validation: ValidationResult;
}

export interface ValidationResult {
  classification: ExecutionClassification;
  reason: string;
  minNetProfit: number;
  minRoi: number;
  minLiquidity: bigint;
}

export interface ReplayDelayStats {
  delaySeconds: number;
  total: number;
  stillProfitable: number;
  survivalRate: number;
  executableCount: number;
  marginalCount: number;
  deadCount: number;
  averageCurrentProfit: number;
  averageProfitChangePct: number;
  bestCurrentProfit: number;
}

export interface TokenReplayStats {
  token: string;
  total: number;
  stillProfitable: number;
  survivalRate: number;
  executableCount: number;
  marginalCount: number;
  deadCount: number;
}

export interface RouteReplayStats {
  route: string;
  total: number;
  stillProfitable: number;
  survivalRate: number;
  executableCount: number;
  marginalCount: number;
  deadCount: number;
}

export interface OpportunitySurvival {
  token: string;
  route: string;
  size: number;
  opportunityId?: number;
  originalProfit: number;
  survivedDelays: number;
  maxDelayWithProfit: number;
  classificationAtMaxDelay: ExecutionClassification;
  currentProfitAtMaxDelay: number;
  reasonAtMaxDelay: string;
}

export interface ReplayReportData {
  generatedAt: string;
  replayWindowSeconds: number;
  recentOpportunities: number;
  totalReplays: number;
  delayStats: ReplayDelayStats[];
  tokenStats: TokenReplayStats[];
  routeStats: RouteReplayStats[];
  topSurvivors: OpportunitySurvival[];
}

export type ReplayReportPath = string;
