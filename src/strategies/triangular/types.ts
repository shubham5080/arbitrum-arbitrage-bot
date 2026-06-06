/**
 * Day 18: Triangular Arbitrage Types
 * 
 * Models the structure for three-token arbitrage routes that exploit
 * inefficiencies across multiple DEX liquidity pools.
 */

export interface TriangleRoute {
  startToken: string; // e.g., USDC
  middleToken: string; // e.g., ARB or LINK
  endToken: string; // e.g., WETH
  startTokenDecimals: number;
  middleTokenDecimals: number;
  endTokenDecimals: number;
}

/**
 * Simulation of a single leg of a triangle route
 * (buying or selling one token for another)
 */
export interface RouteLegResult {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  priceExecuted: number; // amountOut / amountIn
  dex: string;
  poolAddress: string;
  feeTier?: number | null;
  liquidity?: string | null;
}

/**
 * Complete simulation result for a triangle route
 */
export interface TriangleSimulationResult {
  route: TriangleRoute;
  initialAmount: number; // Starting USDC
  finalAmount: number; // Ending USDC
  grossProfit: number; // finalAmount - initialAmount (before costs)
  profitPercent: number; // (finalAmount - initialAmount) / initialAmount
  
  // Legs of the journey
  leg1: RouteLegResult; // USDC -> Middle Token
  leg2: RouteLegResult; // Middle Token -> End Token
  leg3: RouteLegResult; // End Token -> USDC
  
  timestamp: number;
  executionTime?: number; // ms
}

/**
 * Triangle opportunity for database storage
 */
export interface StoredTriangleOpportunity {
  id?: number;
  timestamp: number;
  start_token: string; // USDC
  middle_token: string; // ARB or LINK
  end_token: string; // WETH
  route_name: string; // Human readable, e.g., "USDC->ARB->WETH->USDC"
  
  initial_amount: number;
  final_amount: number;
  gross_profit: number;
  profit_percent: number;
  
  leg1_dex: string;
  leg1_price: number;
  leg2_dex: string;
  leg2_price: number;
  leg3_dex: string;
  leg3_price: number;
  
  execution_time_ms?: number;
}
