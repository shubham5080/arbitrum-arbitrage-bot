import Database from "better-sqlite3";
import path from "path";
import { TriangleSimulationResult } from "./triangleProfitability";

const dbPath = path.join(__dirname, "../../arbitrage.db");
const db = new Database(dbPath);

export interface StoredTriangularOpportunity {
  id?: number;
  timestamp: number;
  route: string;
  dex_path: string;
  start_token: string;
  start_amount: number;
  end_amount: number;
  start_amount_usd: number;
  end_amount_usd: number;
  gross_profit: number;
  net_profit: number;
  net_profit_pct: number;
  gas_cost: number;
  flash_fee: number;
  executable: number;
  quote_success: number;
  error?: string | null;
}

export function initializeTriangularTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS triangular_opportunities (
      id INTEGER PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      route TEXT NOT NULL,
      dex_path TEXT NOT NULL,
      start_token TEXT NOT NULL,
      start_amount REAL NOT NULL,
      end_amount REAL NOT NULL,
      start_amount_usd REAL NOT NULL,
      end_amount_usd REAL NOT NULL,
      gross_profit REAL NOT NULL,
      net_profit REAL NOT NULL,
      net_profit_pct REAL NOT NULL,
      gas_cost REAL NOT NULL,
      flash_fee REAL NOT NULL,
      executable INTEGER NOT NULL DEFAULT 0,
      quote_success INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tri_opp_ts ON triangular_opportunities(timestamp);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tri_opp_route ON triangular_opportunities(route, dex_path);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tri_opp_profit ON triangular_opportunities(net_profit);
  `);
}

export function saveTriangularOpportunity(
  result: TriangleSimulationResult,
  timestamp = Math.floor(Date.now() / 1000)
): number {
  const stmt = db.prepare(`
    INSERT INTO triangular_opportunities (
      timestamp, route, dex_path, start_token, start_amount, end_amount,
      start_amount_usd, end_amount_usd, gross_profit, net_profit, net_profit_pct,
      gas_cost, flash_fee, executable, quote_success, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    timestamp,
    result.cycle.label,
    result.dexPathLabel,
    result.startToken,
    result.startAmount,
    result.endAmount,
    result.startAmountUsd,
    result.endAmountUsd,
    result.grossProfit,
    result.netProfit,
    result.netProfitPct,
    result.gasCost,
    result.flashFee,
    result.executable ? 1 : 0,
    result.quoteSuccess ? 1 : 0,
    result.error ?? null
  );

  return res.lastInsertRowid as number;
}

export function getTriangularOpportunitiesSince(secondsAgo: number): StoredTriangularOpportunity[] {
  const cutoff = Math.floor(Date.now() / 1000) - secondsAgo;
  return db
    .prepare(`SELECT * FROM triangular_opportunities WHERE timestamp >= ? ORDER BY timestamp ASC`)
    .all(cutoff) as StoredTriangularOpportunity[];
}

export function getAllTriangularOpportunities(): StoredTriangularOpportunity[] {
  return db
    .prepare(`SELECT * FROM triangular_opportunities ORDER BY timestamp DESC`)
    .all() as StoredTriangularOpportunity[];
}

export function countTriangularOpportunities(): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM triangular_opportunities`).get() as { c: number };
  return row.c;
}

export function getTopTriangularByNetProfit(limit = 20): StoredTriangularOpportunity[] {
  return db
    .prepare(
      `SELECT * FROM triangular_opportunities WHERE quote_success = 1 ORDER BY net_profit DESC LIMIT ?`
    )
    .all(limit) as StoredTriangularOpportunity[];
}

export function getTriangularRouteFrequency(): { route: string; dex_path: string; count: number; avg_net: number; max_net: number }[] {
  return db
    .prepare(
      `SELECT route, dex_path, COUNT(*) as count,
              AVG(net_profit) as avg_net, MAX(net_profit) as max_net
       FROM triangular_opportunities WHERE quote_success = 1
       GROUP BY route, dex_path ORDER BY avg_net DESC`
    )
    .all() as { route: string; dex_path: string; count: number; avg_net: number; max_net: number }[];
}

export function getTriangularProfitabilityStatsSince(secondsAgo: number): {
  total: number;
  quoted: number;
  profitable: number;
  nearBreakEven: number;
  avgNet: number;
  maxNet: number;
} {
  const cutoff = Math.floor(Date.now() / 1000) - secondsAgo;
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN quote_success = 1 THEN 1 ELSE 0 END) as quoted,
              SUM(CASE WHEN executable = 1 THEN 1 ELSE 0 END) as profitable,
              SUM(CASE WHEN quote_success = 1 AND net_profit > -2 AND net_profit <= 0 THEN 1 ELSE 0 END) as near_break_even,
              AVG(CASE WHEN quote_success = 1 THEN net_profit END) as avg_net,
              MAX(CASE WHEN quote_success = 1 THEN net_profit END) as max_net
       FROM triangular_opportunities WHERE timestamp >= ?`
    )
    .get(cutoff) as {
    total: number;
    quoted: number;
    profitable: number;
    near_break_even: number;
    avg_net: number;
    max_net: number;
  };

  return {
    total: row.total ?? 0,
    quoted: row.quoted ?? 0,
    profitable: row.profitable ?? 0,
    nearBreakEven: row.near_break_even ?? 0,
    avgNet: row.avg_net ?? 0,
    maxNet: row.max_net ?? 0,
  };
}

export function getTriangularProfitabilityStats(): {
  total: number;
  quoted: number;
  profitable: number;
  nearBreakEven: number;
  avgNet: number;
  maxNet: number;
} {
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN quote_success = 1 THEN 1 ELSE 0 END) as quoted,
              SUM(CASE WHEN executable = 1 THEN 1 ELSE 0 END) as profitable,
              SUM(CASE WHEN quote_success = 1 AND net_profit > -1 AND net_profit <= 0 THEN 1 ELSE 0 END) as near_break_even,
              AVG(CASE WHEN quote_success = 1 THEN net_profit END) as avg_net,
              MAX(CASE WHEN quote_success = 1 THEN net_profit END) as max_net
       FROM triangular_opportunities`
    )
    .get() as {
    total: number;
    quoted: number;
    profitable: number;
    near_break_even: number;
    avg_net: number;
    max_net: number;
  };

  return {
    total: row.total ?? 0,
    quoted: row.quoted ?? 0,
    profitable: row.profitable ?? 0,
    nearBreakEven: row.near_break_even ?? 0,
    avgNet: row.avg_net ?? 0,
    maxNet: row.max_net ?? 0,
  };
}
