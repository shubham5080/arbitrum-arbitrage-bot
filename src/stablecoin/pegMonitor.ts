import { ethers } from "ethers";
import { DEXES } from "../config/dexes";
import { discoverStablecoinPools } from "./stablecoinDiscovery";
import { quoteStablecoinPool } from "./stablecoinQuotes";
import { STABLECOINS } from "./stablecoinConfig";
import { MONITORED_PAIRS, StablecoinPair } from "./stablecoinPairs";
import {
  findCurvePoolForPair,
  quoteCurveSwap,
} from "../research/curveResearch";

export interface PegReading {
  pair: string;
  pairLabel: string;
  impliedRate: number;
  deviationBps: number;
  dex: string;
  timestamp: number;
  amountIn: number;
  quoteSuccess: boolean;
}

const DEFAULT_TRADE_SIZE = 10_000;

function computeImpliedRate(
  amountIn: number,
  amountOutRaw: bigint,
  inDecimals: number,
  outDecimals: number
): number {
  const outHuman = Number(ethers.formatUnits(amountOutRaw, outDecimals));
  return outHuman / amountIn;
}

function computeDeviationBps(impliedRate: number, pegTarget = 1.0): number {
  return (impliedRate / pegTarget - 1) * 10_000;
}

async function quoteDexPair(
  provider: ethers.Provider,
  pair: StablecoinPair,
  dex: string,
  amountIn: number
): Promise<PegReading | null> {
  const base = STABLECOINS[pair.base];
  const quote = STABLECOINS[pair.quote];
  const discoveries = await discoverStablecoinPools(provider, pair);
  const found = discoveries.find((d) => d.dex === dex);
  if (!found?.pool) return null;

  try {
    const amountOut = await quoteStablecoinPool(
      provider,
      dex,
      found.pool,
      base.address,
      quote.address,
      String(amountIn),
      base.decimals,
      quote.decimals
    );
    if (amountOut === null) return null;

    const impliedRate = computeImpliedRate(
      amountIn,
      amountOut,
      base.decimals,
      quote.decimals
    );

    return {
      pair: pair.id,
      pairLabel: pair.label,
      impliedRate,
      deviationBps: computeDeviationBps(impliedRate),
      dex,
      timestamp: Math.floor(Date.now() / 1000),
      amountIn,
      quoteSuccess: true,
    };
  } catch {
    return null;
  }
}

async function quoteCurvePair(
  provider: ethers.Provider,
  pair: StablecoinPair,
  amountIn: number
): Promise<PegReading | null> {
  const base = STABLECOINS[pair.base];
  const quote = STABLECOINS[pair.quote];
  const pool = await findCurvePoolForPair(provider, base.address, quote.address);
  if (!pool) return null;

  const amountOut = await quoteCurveSwap(
    provider,
    pool,
    base.address,
    quote.address,
    String(amountIn),
    base.decimals
  );
  if (amountOut === null) return null;

  const impliedRate = computeImpliedRate(
    amountIn,
    amountOut,
    base.decimals,
    quote.decimals
  );

  return {
    pair: pair.id,
    pairLabel: pair.label,
    impliedRate,
    deviationBps: computeDeviationBps(impliedRate),
    dex: "CURVE",
    timestamp: Math.floor(Date.now() / 1000),
    amountIn,
    quoteSuccess: true,
  };
}

export async function scanPegDeviations(
  provider: ethers.Provider,
  pairs: StablecoinPair[] = MONITORED_PAIRS,
  amountIn = DEFAULT_TRADE_SIZE
): Promise<PegReading[]> {
  const readings: PegReading[] = [];
  const dexes = [DEXES.UNISWAP, DEXES.SUSHI, DEXES.PANCAKESWAP, "CURVE"] as const;

  for (const pair of pairs) {
    for (const dex of dexes) {
      const reading =
        dex === "CURVE"
          ? await quoteCurvePair(provider, pair, amountIn)
          : await quoteDexPair(provider, pair, dex, amountIn);
      if (reading) readings.push(reading);
    }
  }

  return readings;
}

export function formatPegTable(readings: PegReading[]): string {
  const lines = [
    "| Pair | DEX | Implied Rate | Deviation (bps) |",
    "|------|-----|--------------|-----------------|",
  ];
  for (const r of readings.sort((a, b) => Math.abs(b.deviationBps) - Math.abs(a.deviationBps))) {
    lines.push(
      `| ${r.pairLabel} | ${r.dex} | ${r.impliedRate.toFixed(6)} | ${r.deviationBps.toFixed(2)} |`
    );
  }
  return lines.join("\n");
}
