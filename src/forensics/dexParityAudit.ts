import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { DEXES } from "../config/dexes";
import { TOKENS } from "../config/tokens";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { getSushiV3Quote } from "../quotes/sushiV3Quote";
import {
  getUniswapBuyQuote,
  getUniswapSellQuote,
  getSushiBuyQuote,
  getSushiSellQuote,
} from "../quotes/quoteEngine";
import { StoredOpportunity } from "../database/database";
import { detectPoolType } from "./quoteTrace";

const V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

export interface DexParityLeg {
  dex: string;
  leg: "buy" | "sell";
  scannerQuote: string;
  directQuote: string;
  simulationQuote: string;
  absoluteError: number;
  percentError: number;
  method: string;
}

export interface DexParityResult {
  token: string;
  route: string;
  size: number;
  legs: DexParityLeg[];
}

function v2Simulate(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps = 30
): bigint {
  const feeMultiplier = 10000n - BigInt(feeBps);
  const amountInWithFee = (amountIn * feeMultiplier) / 10000n;
  return (amountInWithFee * reserveOut) / (reserveIn * 10000n + amountInWithFee);
}

async function directUniswapQuote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  inDecimals: number,
  fee: number
): Promise<bigint> {
  const { getUniswapQuote } = await import("../quotes/quoteEngine");
  return getUniswapQuote(provider, tokenIn, tokenOut, amountIn, inDecimals, 6, fee);
}

type V2PairContract = ethers.Contract & {
  token0(): Promise<string>;
  token1(): Promise<string>;
  getReserves(): Promise<{ reserve0: bigint; reserve1: bigint }>;
};

async function simulateV2Quote(
  provider: ethers.Provider,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  inDecimals: number
): Promise<bigint | null> {
  const pair = new ethers.Contract(poolAddress, V2_PAIR_ABI, provider) as V2PairContract;
  try {
    const [token0, token1, reserves] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.getReserves(),
    ]);
    const amountInUnits = ethers.parseUnits(amountIn, inDecimals);
    const inLc = tokenIn.toLowerCase();
    const outLc = tokenOut.toLowerCase();
    let reserveIn: bigint;
    let reserveOut: bigint;

    if (token0.toLowerCase() === inLc && token1.toLowerCase() === outLc) {
      reserveIn = BigInt(reserves.reserve0.toString());
      reserveOut = BigInt(reserves.reserve1.toString());
    } else if (token1.toLowerCase() === inLc && token0.toLowerCase() === outLc) {
      reserveIn = BigInt(reserves.reserve1.toString());
      reserveOut = BigInt(reserves.reserve0.toString());
    } else {
      return null;
    }

    return v2Simulate(reserveIn, reserveOut, amountInUnits);
  } catch {
    return null;
  }
}

function pctError(scanner: bigint, reference: bigint): number {
  if (reference === 0n) return scanner === 0n ? 0 : 100;
  const diff = scanner > reference ? scanner - reference : reference - scanner;
  return Number(((diff * 10000n) / reference) / 100n);
}

export async function auditDexParity(
  provider: ethers.Provider,
  opportunity: StoredOpportunity
): Promise<DexParityResult> {
  const token = (TOKENS as Record<string, { address: string; decimals: number }>)[opportunity.token];
  const routeParts = opportunity.route.split("->").map((s) => s.trim());
  const buyDex = routeParts[0];
  const sellDex = routeParts[1];
  if (!buyDex || !sellDex) {
    throw new Error(`Invalid route: ${opportunity.route}`);
  }
  const legs: DexParityLeg[] = [];

  const buyPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, buyDex);
  const sellPool = await getHighestLiquidityPoolForDex(provider, opportunity.token, sellDex);

  if (token && buyPool) {
    const amountIn = opportunity.size.toString();
    let scannerOut: bigint;
    let directOut: bigint;
    let simOut: bigint | null = null;
    let method = "unknown";

    if (buyDex === DEXES.UNISWAP) {
      scannerOut = await getUniswapBuyQuote(
        provider,
        token.address,
        token.decimals,
        amountIn,
        buyPool.feeTier
      );
      directOut = await directUniswapQuote(
        provider,
        ADDRESSES.USDC,
        token.address,
        amountIn,
        6,
        buyPool.feeTier
      );
      method = "uniswap_v3_quoter";
    } else {
      scannerOut = await getSushiBuyQuote(
        provider,
        token.address,
        token.decimals,
        amountIn,
        buyPool
      );
      const poolType = await detectPoolType(provider, buyPool.poolAddress);
      if (poolType === "v3") {
        directOut = await getSushiV3Quote(
          provider,
          ADDRESSES.USDC,
          token.address,
          amountIn,
          6,
          buyPool.feeTier
        );
        method = "sushi_v3_quoter";
      } else {
        directOut = scannerOut;
        simOut = await simulateV2Quote(
          provider,
          buyPool.poolAddress,
          ADDRESSES.USDC,
          token.address,
          amountIn,
          6
        );
        method = "sushi_v2";
      }
    }

    const reference = simOut ?? directOut;
    legs.push({
      dex: buyDex,
      leg: "buy",
      scannerQuote: scannerOut.toString(),
      directQuote: directOut.toString(),
      simulationQuote: reference.toString(),
      absoluteError: Number(ethers.formatUnits(scannerOut > reference ? scannerOut - reference : reference - scannerOut, token.decimals)),
      percentError: pctError(scannerOut, reference),
      method,
    });
  }

  if (token && sellPool && legs.length > 0) {
    const buyLeg = legs[0]!;
    const tokenAmt = ethers.formatUnits(BigInt(buyLeg.scannerQuote), token.decimals);
    let scannerOut: bigint;
    let directOut: bigint;
    let simOut: bigint | null = null;
    let method = "unknown";

    if (sellDex === DEXES.UNISWAP) {
      scannerOut = await getUniswapSellQuote(
        provider,
        token.address,
        token.decimals,
        tokenAmt,
        sellPool.feeTier
      );
      directOut = await directUniswapQuote(
        provider,
        token.address,
        ADDRESSES.USDC,
        tokenAmt,
        token.decimals,
        sellPool.feeTier
      );
      method = "uniswap_v3_quoter";
    } else {
      scannerOut = await getSushiSellQuote(
        provider,
        token.address,
        token.decimals,
        tokenAmt,
        sellPool
      );
      const poolType = await detectPoolType(provider, sellPool.poolAddress);
      if (poolType === "v3") {
        directOut = await getSushiV3Quote(
          provider,
          token.address,
          ADDRESSES.USDC,
          tokenAmt,
          token.decimals,
          sellPool.feeTier
        );
        method = "sushi_v3_quoter";
      } else {
        directOut = scannerOut;
        simOut = await simulateV2Quote(
          provider,
          sellPool.poolAddress,
          token.address,
          ADDRESSES.USDC,
          tokenAmt,
          token.decimals
        );
        method = "sushi_v2";
      }
    }

    const reference = simOut ?? directOut;
    legs.push({
      dex: sellDex,
      leg: "sell",
      scannerQuote: scannerOut.toString(),
      directQuote: directOut.toString(),
      simulationQuote: reference.toString(),
      absoluteError: Number(
        ethers.formatUnits(
          scannerOut > reference ? scannerOut - reference : reference - scannerOut,
          6
        )
      ),
      percentError: pctError(scannerOut, reference),
      method,
    });
  }

  return {
    token: opportunity.token,
    route: opportunity.route,
    size: opportunity.size,
    legs,
  };
}
