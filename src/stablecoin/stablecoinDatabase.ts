import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "../../arbitrage.db");
const db = new Database(dbPath);

export interface StoredPegSnapshot {
  id?: number;
  pair: string;
  implied_rate: number;
  deviation_bps: number;
  dex: string;
  timestamp: number;
}

export interface StoredStablecoinOpportunity {
  id?: number;
  pair: string;
  deviation: number;
  timestamp: number;
  duration: number;
  dex?: string;
  implied_rate?: number;
}

export type DeviationBucket = "0-1" | "1-5" | "5-10" | "10+";

export function initializeStablecoinTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS peg_snapshots (
      id INTEGER PRIMARY KEY,
      pair TEXT NOT NULL,
      implied_rate REAL NOT NULL,
      deviation_bps REAL NOT NULL,
      dex TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_peg_pair_ts ON peg_snapshots(pair, timestamp);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stablecoin_opportunities (
      id INTEGER PRIMARY KEY,
      pair TEXT NOT NULL,
      deviation REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      dex TEXT,
      implied_rate REAL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stable_opp_pair ON stablecoin_opportunities(pair, timestamp);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dex_price_comparisons (
      id INTEGER PRIMARY KEY,
      pair TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      curve_rate REAL,
      uniswap_rate REAL,
      sushi_rate REAL,
      pancake_rate REAL,
      max_divergence_bps REAL NOT NULL
    );
  `);
}

export function savePegSnapshot(snapshot: StoredPegSnapshot): number {
  const result = db
    .prepare(
      `INSERT INTO peg_snapshots (pair, implied_rate, deviation_bps, dex, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      snapshot.pair,
      snapshot.implied_rate,
      snapshot.deviation_bps,
      snapshot.dex,
      snapshot.timestamp
    );
  return result.lastInsertRowid as number;
}

export function saveStablecoinOpportunity(opp: StoredStablecoinOpportunity): number {
  const result = db
    .prepare(
      `INSERT INTO stablecoin_opportunities (pair, deviation, timestamp, duration, dex, implied_rate)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      opp.pair,
      opp.deviation,
      opp.timestamp,
      opp.duration,
      opp.dex ?? null,
      opp.implied_rate ?? null
    );
  return result.lastInsertRowid as number;
}

export function saveDexPriceComparison(data: {
  pair: string;
  timestamp: number;
  curveRate: number | null;
  uniswapRate: number | null;
  sushiRate: number | null;
  pancakeRate: number | null;
  maxDivergenceBps: number;
}): number {
  const result = db
    .prepare(
      `INSERT INTO dex_price_comparisons
       (pair, timestamp, curve_rate, uniswap_rate, sushi_rate, pancake_rate, max_divergence_bps)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.pair,
      data.timestamp,
      data.curveRate,
      data.uniswapRate,
      data.sushiRate,
      data.pancakeRate,
      data.maxDivergenceBps
    );
  return result.lastInsertRowid as number;
}

export function getPegSnapshotsSince(secondsAgo: number): StoredPegSnapshot[] {
  const cutoff = Math.floor(Date.now() / 1000) - secondsAgo;
  return db
    .prepare(`SELECT * FROM peg_snapshots WHERE timestamp >= ? ORDER BY timestamp ASC`)
    .all(cutoff) as StoredPegSnapshot[];
}

export function getStablecoinOpportunitiesSince(secondsAgo: number): StoredStablecoinOpportunity[] {
  const cutoff = Math.floor(Date.now() / 1000) - secondsAgo;
  return db
    .prepare(`SELECT * FROM stablecoin_opportunities WHERE timestamp >= ? ORDER BY timestamp ASC`)
    .all(cutoff) as StoredStablecoinOpportunity[];
}

export function getAllStablecoinOpportunities(): StoredStablecoinOpportunity[] {
  return db
    .prepare(`SELECT * FROM stablecoin_opportunities ORDER BY timestamp ASC`)
    .all() as StoredStablecoinOpportunity[];
}

export function getDexComparisonsSince(secondsAgo: number) {
  const cutoff = Math.floor(Date.now() / 1000) - secondsAgo;
  return db
    .prepare(`SELECT * FROM dex_price_comparisons WHERE timestamp >= ? ORDER BY timestamp ASC`)
    .all(cutoff);
}

export function classifyDeviationBps(bps: number): DeviationBucket {
  const abs = Math.abs(bps);
  if (abs < 1) return "0-1";
  if (abs < 5) return "1-5";
  if (abs < 10) return "5-10";
  return "10+";
}

export function getDeviationFrequency(secondsAgo?: number): Record<DeviationBucket, number> {
  const buckets: Record<DeviationBucket, number> = {
    "0-1": 0,
    "1-5": 0,
    "5-10": 0,
    "10+": 0,
  };

  const rows =
    secondsAgo !== undefined
      ? getPegSnapshotsSince(secondsAgo)
      : (db.prepare(`SELECT deviation_bps FROM peg_snapshots`).all() as { deviation_bps: number }[]);

  for (const row of rows) {
    const bps = "deviation_bps" in row ? row.deviation_bps : (row as { deviation_bps: number }).deviation_bps;
    buckets[classifyDeviationBps(bps)] += 1;
  }
  return buckets;
}

export function getDurationStats(): {
  count: number;
  avgDurationSec: number;
  maxDurationSec: number;
  medianDurationSec: number;
} {
  const rows = db
    .prepare(`SELECT duration FROM stablecoin_opportunities WHERE duration > 0`)
    .all() as { duration: number }[];

  if (rows.length === 0) {
    return { count: 0, avgDurationSec: 0, maxDurationSec: 0, medianDurationSec: 0 };
  }

  const durations = rows.map((r) => r.duration).sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const mid = Math.floor(durations.length / 2);

  return {
    count: durations.length,
    avgDurationSec: Math.round(sum / durations.length),
    maxDurationSec: durations[durations.length - 1]!,
    medianDurationSec:
      durations.length % 2 === 0
        ? Math.round((durations[mid - 1]! + durations[mid]!) / 2)
        : durations[mid]!,
  };
}

export function countPegSnapshots(): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM peg_snapshots`).get() as { c: number };
  return row.c;
}
