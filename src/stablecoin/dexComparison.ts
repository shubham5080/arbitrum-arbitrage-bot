import { ethers } from "ethers";
import { DEXES } from "../config/dexes";
import { discoverStablecoinPools } from "./stablecoinDiscovery";
import { STABLECOINS } from "./stablecoinConfig";
import { MONITORED_PAIRS, StablecoinPair } from "./stablecoinPairs";
import { quoteStablecoinPool } from "./stablecoinQuotes";
import {
  findCurvePoolForPair,
  quoteCurveSwap,
} from "../research/curveResearch";
import { saveDexPriceComparison } from "./stablecoinDatabase";

export interface DexPriceComparison {
  pair: string;
  pairLabel: string;
  timestamp: number;
  curveRate: number | null;
  uniswapRate: number | null;
  sushiRate: number | null;
  pancakeRate: number | null;
  maxDivergenceBps: number;
  bestBuyDex: string | null;
  bestSellDex: string | null;
}

const TRADE_SIZE = 10_000;

async function quoteOnDex(
  provider: ethers.Provider,
  pair: StablecoinPair,
  dex: string
): Promise<number | null> {
  const base = STABLECOINS[pair.base];
  const quote = STABLECOINS[pair.quote];

  if (dex === "CURVE") {
    const pool = await findCurvePoolForPair(provider, base.address, quote.address);
    if (!pool) return null;
    const out = await quoteCurveSwap(
      provider,
      pool,
      base.address,
      quote.address,
      String(TRADE_SIZE),
      base.decimals
    );
    if (out === null) return null;
    return Number(ethers.formatUnits(out, quote.decimals)) / TRADE_SIZE;
  }

  const discoveries = await discoverStablecoinPools(provider, pair);
  const found = discoveries.find((d) => d.dex === dex);
  if (!found?.pool) return null;

  const amountOut = await quoteStablecoinPool(
    provider,
    dex,
    found.pool,
    base.address,
    quote.address,
    String(TRADE_SIZE),
    base.decimals,
    quote.decimals
  );
  if (amountOut === null) return null;
  return Number(ethers.formatUnits(amountOut, quote.decimals)) / TRADE_SIZE;
}

function computeMaxDivergence(rates: (number | null)[]): number {
  const valid = rates.filter((r): r is number => r !== null);
  if (valid.length < 2) return 0;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return ((max - min) / ((max + min) / 2)) * 10_000;
}

export async function compareDexPrices(
  provider: ethers.Provider,
  pairs: StablecoinPair[] = MONITORED_PAIRS
): Promise<DexPriceComparison[]> {
  const results: DexPriceComparison[] = [];

  for (const pair of pairs) {
    const [curveRate, uniswapRate, sushiRate, pancakeRate] = await Promise.all([
      quoteOnDex(provider, pair, "CURVE"),
      quoteOnDex(provider, pair, DEXES.UNISWAP),
      quoteOnDex(provider, pair, DEXES.SUSHI),
      quoteOnDex(provider, pair, DEXES.PANCAKESWAP),
    ]);

    const rates = [
      { dex: "CURVE", rate: curveRate },
      { dex: DEXES.UNISWAP, rate: uniswapRate },
      { dex: DEXES.SUSHI, rate: sushiRate },
      { dex: DEXES.PANCAKESWAP, rate: pancakeRate },
    ].filter((r) => r.rate !== null) as { dex: string; rate: number }[];

    const maxDivergenceBps = computeMaxDivergence([
      curveRate,
      uniswapRate,
      sushiRate,
      pancakeRate,
    ]);

    const bestBuy = rates.length > 0 ? rates.reduce((a, b) => (a.rate > b.rate ? a : b)).dex : null;
    const bestSell = rates.length > 0 ? rates.reduce((a, b) => (a.rate < b.rate ? a : b)).dex : null;

    const comparison: DexPriceComparison = {
      pair: pair.id,
      pairLabel: pair.label,
      timestamp: Math.floor(Date.now() / 1000),
      curveRate,
      uniswapRate,
      sushiRate,
      pancakeRate,
      maxDivergenceBps,
      bestBuyDex: bestBuy,
      bestSellDex: bestSell,
    };

    saveDexPriceComparison({
      pair: pair.id,
      timestamp: comparison.timestamp,
      curveRate,
      uniswapRate,
      sushiRate,
      pancakeRate,
      maxDivergenceBps,
    });

    results.push(comparison);
  }

  return results;
}

export function formatDexComparisonMarkdown(comparisons: DexPriceComparison[]): string {
  const lines = [
    "## Curve + DEX Comparison",
    "",
    "| Pair | Curve | Uniswap | Sushi | Pancake | Max Divergence (bps) |",
    "|------|-------|---------|-------|---------|----------------------|",
  ];

  for (const c of comparisons) {
    const fmt = (r: number | null) => (r !== null ? r.toFixed(6) : "—");
    lines.push(
      `| ${c.pairLabel} | ${fmt(c.curveRate)} | ${fmt(c.uniswapRate)} | ${fmt(c.sushiRate)} | ${fmt(c.pancakeRate)} | ${c.maxDivergenceBps.toFixed(2)} |`
    );
  }

  return lines.join("\n");
}
