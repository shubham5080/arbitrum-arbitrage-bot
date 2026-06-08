import { ethers } from "ethers";
import dotenv from "dotenv";
import { initializeDatabase } from "../database/database";
import { initializeStablecoinTables, savePegSnapshot, saveStablecoinOpportunity } from "./stablecoinDatabase";
import { scanPegDeviations, PegReading } from "./pegMonitor";
import { compareDexPrices } from "./dexComparison";
import { MONITORED_PAIRS } from "./stablecoinPairs";
import { closeDatabase } from "../database/database";

dotenv.config();

const DEFAULT_INTERVAL_MS = 30_000;
const DEVIATION_THRESHOLD_BPS = 1.0;

interface ActiveEpisode {
  pair: string;
  dex: string;
  startTimestamp: number;
  peakDeviationBps: number;
  impliedRate: number;
}

const activeEpisodes = new Map<string, ActiveEpisode>();

function episodeKey(pair: string, dex: string): string {
  return `${pair}:${dex}`;
}

function processReading(reading: PegReading) {
  const key = episodeKey(reading.pair, reading.dex);
  const absDev = Math.abs(reading.deviationBps);
  const active = activeEpisodes.get(key);

  if (absDev >= DEVIATION_THRESHOLD_BPS) {
    if (!active) {
      activeEpisodes.set(key, {
        pair: reading.pair,
        dex: reading.dex,
        startTimestamp: reading.timestamp,
        peakDeviationBps: absDev,
        impliedRate: reading.impliedRate,
      });
    } else {
      active.peakDeviationBps = Math.max(active.peakDeviationBps, absDev);
      active.impliedRate = reading.impliedRate;
    }
  } else if (active) {
    const duration = reading.timestamp - active.startTimestamp;
    saveStablecoinOpportunity({
      pair: active.pair,
      deviation: active.peakDeviationBps,
      timestamp: active.startTimestamp,
      duration,
      dex: active.dex,
      implied_rate: active.impliedRate,
    });
    activeEpisodes.delete(key);
  }
}

export async function runStablecoinCollectionCycle(
  provider: ethers.Provider
): Promise<{ readings: PegReading[]; comparisons: number }> {
  const readings = await scanPegDeviations(provider);
  for (const r of readings) {
    savePegSnapshot({
      pair: r.pair,
      implied_rate: r.impliedRate,
      deviation_bps: r.deviationBps,
      dex: r.dex,
      timestamp: r.timestamp,
    });
    processReading(r);
  }

  const comparisons = await compareDexPrices(provider, MONITORED_PAIRS);
  return { readings, comparisons: comparisons.length };
}

export interface CollectorOptions {
  intervalMs?: number;
  maxCycles?: number;
  onCycle?: (cycle: number, readings: PegReading[]) => void;
}

export async function runStablecoinCollector(options: CollectorOptions = {}) {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required");
  }

  initializeDatabase();
  initializeStablecoinTables();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxCycles = options.maxCycles ?? Infinity;
  let cycle = 0;

  const shutdown = () => {
    console.log("\nShutting down stablecoin collector...");
    flushActiveEpisodes();
    closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`Stablecoin collector started (interval: ${intervalMs}ms)`);

  while (cycle < maxCycles) {
    cycle += 1;
    const start = Date.now();
    try {
      const { readings } = await runStablecoinCollectionCycle(provider);
      options.onCycle?.(cycle, readings);
      console.log(
        `[${new Date().toISOString()}] cycle ${cycle}: ${readings.length} readings, ` +
          `max |dev|=${Math.max(...readings.map((r) => Math.abs(r.deviationBps)), 0).toFixed(2)} bps`
      );
    } catch (err) {
      console.error(`Cycle ${cycle} failed:`, err);
    }

    if (cycle < maxCycles) {
      const elapsed = Date.now() - start;
      await new Promise((r) => setTimeout(r, Math.max(0, intervalMs - elapsed)));
    }
  }

  flushActiveEpisodes();
  closeDatabase();
}

function flushActiveEpisodes() {
  const now = Math.floor(Date.now() / 1000);
  for (const [, ep] of activeEpisodes) {
    saveStablecoinOpportunity({
      pair: ep.pair,
      deviation: ep.peakDeviationBps,
      timestamp: ep.startTimestamp,
      duration: now - ep.startTimestamp,
      dex: ep.dex,
      implied_rate: ep.impliedRate,
    });
  }
  activeEpisodes.clear();
}

async function main() {
  const intervalArg = process.argv[2];
  const cyclesArg = process.argv[3];
  const intervalMs = intervalArg ? parseInt(intervalArg, 10) : DEFAULT_INTERVAL_MS;
  const maxCycles = cyclesArg ? parseInt(cyclesArg, 10) : Infinity;

  await runStablecoinCollector({ intervalMs, maxCycles });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
