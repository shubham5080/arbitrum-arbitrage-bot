import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import {
  getUniswapBuyQuote,
  getUniswapSellQuote,
  getSushiBuyQuote,
  getSushiSellQuote,
} from "../quotes/quoteEngine";
import { PoolMetadata } from "../types/poolMetadata";
import { StoredOpportunity } from "../database/database";

const V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const V3_POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

export type QuoteMethod =
  | "uniswap_v3_quoter"
  | "sushi_v3_quoter"
  | "sushi_v2_reserves"
  | "sushi_v2_balance_fallback"
  | "camelot_slot0"
  | "scanner_wrapper"
  | "unknown";

export type PoolType = "v3" | "v2" | "unknown";

export interface QuoteTraceLeg {
  leg: "buy" | "sell";
  dex: string;
  tokenIn: string;
  tokenOut: string;
  poolAddress: string;
  poolType: PoolType;
  quoteMethod: QuoteMethod;
  amountIn: string;
  amountOut: string;
  feeTier: number | null;
  liquidity: string | null;
  timestamp: number;
  notes: string[];
}

export interface QuoteTrace {
  opportunityId: number | null;
  token: string;
  route: string;
  size: number;
  buyLeg: QuoteTraceLeg;
  sellLeg: QuoteTraceLeg;
  scannerNetProfit: number;
  tracedGrossProfit: number;
  tracedNetProfit: number;
}

type V3PoolContract = ethers.Contract & { slot0(): Promise<unknown> };
type V2PairContract = ethers.Contract & { getReserves(): Promise<unknown> };

function parseRouteParts(route: string) {
  const [buyDex, sellDex] = route.split("->").map((s) => s.trim());
  if (!buyDex || !sellDex) {
    throw new Error(`Invalid route: ${route}`);
  }
  return { buyDex, sellDex };
}

export async function detectPoolType(
  provider: ethers.Provider,
  poolAddress: string
): Promise<PoolType> {
  const v3 = new ethers.Contract(poolAddress, V3_POOL_ABI, provider) as V3PoolContract;
  try {
    await v3.slot0();
    return "v3";
  } catch {
    const v2 = new ethers.Contract(poolAddress, V2_PAIR_ABI, provider) as V2PairContract;
    try {
      await v2.getReserves();
      return "v2";
    } catch {
      return "unknown";
    }
  }
}

async function traceSushiQuote(
  provider: ethers.Provider,
  leg: "buy" | "sell",
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  pool: PoolMetadata
): Promise<{ amountOut: bigint; method: QuoteMethod; notes: string[]; feeTier: number | null }> {
  const notes: string[] = [`poolType=${pool.poolType}`, `feeTier=${pool.feeTier}`];
  const onChainType = await detectPoolType(provider, pool.poolAddress);
  if (onChainType === "v3" && pool.poolType === "V2") {
    notes.push("CRITICAL: on-chain V3 pool with V2 metadata would have produced phantom spread before fix");
  }

  const wrapperOut =
    leg === "buy"
      ? await getSushiBuyQuote(provider, tokenAddress, tokenDecimals, amountIn, pool)
      : await getSushiSellQuote(provider, tokenAddress, tokenDecimals, amountIn, pool);

  const method: QuoteMethod =
    pool.poolType === "V3" ? "sushi_v3_quoter" : "sushi_v2_reserves";

  return {
    amountOut: wrapperOut,
    method,
    notes,
    feeTier: pool.feeTier,
  };
}

export async function traceOpportunityQuotes(
  provider: ethers.Provider,
  opportunity: StoredOpportunity,
  gasCostUsdc: number,
  flashFee: number
): Promise<QuoteTrace> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[opportunity.token];
  if (!token) {
    throw new Error(`Unknown token ${opportunity.token}`);
  }

  const { buyDex, sellDex } = parseRouteParts(opportunity.route);
  const buyPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, sellDex);

  const now = Math.floor(Date.now() / 1000);
  const amountInBuy = opportunity.size.toString();

  let buyOut: bigint;
  let buyMethod: QuoteMethod = "unknown";
  let buyNotes: string[] = [];
  let buyFee: number | null = buyPool?.feeTier ?? null;

  if (buyDex === DEXES.UNISWAP && buyPool) {
    buyOut = await getUniswapBuyQuote(
      provider,
      token.address,
      token.decimals,
      amountInBuy,
      buyPool.feeTier
    );
    buyMethod = "uniswap_v3_quoter";
  } else if (buyDex === DEXES.SUSHI && buyPool) {
    const traced = await traceSushiQuote(
      provider,
      "buy",
      token.address,
      token.decimals,
      amountInBuy,
      buyPool
    );
    buyOut = traced.amountOut;
    buyMethod = traced.method;
    buyNotes = traced.notes;
    buyFee = traced.feeTier;
  } else {
    throw new Error(`Cannot trace buy leg: ${buyDex}`);
  }

  const tokenAmount = ethers.formatUnits(buyOut, token.decimals);
  let sellOut: bigint;
  let sellMethod: QuoteMethod = "unknown";
  let sellNotes: string[] = [];
  let sellFee: number | null = sellPool?.feeTier ?? null;

  if (sellDex === DEXES.UNISWAP && sellPool) {
    sellOut = await getUniswapSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmount,
      sellPool.feeTier
    );
    sellMethod = "uniswap_v3_quoter";
  } else if (sellDex === DEXES.SUSHI && sellPool) {
    const traced = await traceSushiQuote(
      provider,
      "sell",
      token.address,
      token.decimals,
      tokenAmount,
      sellPool
    );
    sellOut = traced.amountOut;
    sellMethod = traced.method;
    sellNotes = traced.notes;
    sellFee = traced.feeTier;
  } else {
    throw new Error(`Cannot trace sell leg: ${sellDex}`);
  }

  const tracedGross = Number(ethers.formatUnits(sellOut, 6)) - opportunity.size;
  const tracedNet = Number((tracedGross - gasCostUsdc - flashFee).toFixed(6));

  const buyPoolType = buyPool ? await detectPoolType(provider, buyPool.poolAddress) : "unknown";
  const sellPoolType = sellPool ? await detectPoolType(provider, sellPool.poolAddress) : "unknown";

  return {
    opportunityId: opportunity.id ?? null,
    token: opportunity.token,
    route: opportunity.route,
    size: opportunity.size,
    scannerNetProfit: opportunity.net_profit,
    tracedGrossProfit: Number(tracedGross.toFixed(6)),
    tracedNetProfit: tracedNet,
    buyLeg: {
      leg: "buy",
      dex: buyDex,
      tokenIn: ADDRESSES.USDC,
      tokenOut: token.address,
      poolAddress: buyPool?.poolAddress ?? "",
      poolType: buyPoolType,
      quoteMethod: buyMethod,
      amountIn: amountInBuy,
      amountOut: tokenAmount,
      feeTier: buyFee,
      liquidity: buyPool?.liquidity.toString() ?? opportunity.liquidity,
      timestamp: now,
      notes: buyNotes,
    },
    sellLeg: {
      leg: "sell",
      dex: sellDex,
      tokenIn: token.address,
      tokenOut: ADDRESSES.USDC,
      poolAddress: sellPool?.poolAddress ?? "",
      poolType: sellPoolType,
      quoteMethod: sellMethod,
      amountIn: tokenAmount,
      amountOut: ethers.formatUnits(sellOut, 6),
      feeTier: sellFee,
      liquidity: sellPool?.liquidity.toString() ?? null,
      timestamp: now,
      notes: sellNotes,
    },
  };
}

export async function traceScannerWrapper(
  provider: ethers.Provider,
  opportunity: StoredOpportunity
): Promise<{ buyOut: bigint; sellOut: bigint }> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[opportunity.token];
  const { buyDex, sellDex } = parseRouteParts(opportunity.route);
  const buyPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, sellDex);
  if (!token || !buyPool || !sellPool) {
    throw new Error("Pool unavailable for scanner wrapper trace");
  }

  let buyOut: bigint;
  if (buyDex === DEXES.UNISWAP) {
    buyOut = await getUniswapBuyQuote(
      provider,
      token.address,
      token.decimals,
      opportunity.size.toString(),
      buyPool.feeTier
    );
  } else {
    buyOut = await getSushiBuyQuote(
      provider,
      token.address,
      token.decimals,
      opportunity.size.toString(),
      buyPool
    );
  }

  const tokenAmt = ethers.formatUnits(buyOut, token.decimals);
  let sellOut: bigint;
  if (sellDex === DEXES.UNISWAP) {
    sellOut = await getUniswapSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmt,
      sellPool.feeTier
    );
  } else {
    sellOut = await getSushiSellQuote(
      provider,
      token.address,
      token.decimals,
      tokenAmt,
      sellPool
    );
  }

  return { buyOut, sellOut };
}
