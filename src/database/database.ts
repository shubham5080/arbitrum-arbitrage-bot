import Database from "better-sqlite3";
import path from "path";
import { Opportunity } from "../types/opportunity";

const dbPath = path.join(__dirname, "../../arbitrage.db");
const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

export interface StoredOpportunity {
  id?: number;
  timestamp: number;
  token: string;
  route: string;
  size: number;
  gross_profit: number;
  gas_cost: number;
  flash_fee: number;
  net_profit: number;
  buy_price: number;
  sell_price: number;
  spread_percent: number;
  slippage_impact: number;
  spread_contribution: number;
  gas_contribution: number;
  flash_contribution: number;
  execution_contribution: number;
  liquidity: string;
  dex_buy: string;
  dex_sell: string;
}

export function initializeDatabase() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      token TEXT NOT NULL,
      route TEXT NOT NULL,
      size REAL NOT NULL,
      gross_profit REAL NOT NULL,
      gas_cost REAL NOT NULL,
      flash_fee REAL NOT NULL,
      net_profit REAL NOT NULL,
      buy_price REAL NOT NULL,
      sell_price REAL NOT NULL,
      spread_percent REAL NOT NULL,
      slippage_impact REAL NOT NULL,
      spread_contribution REAL NOT NULL,
      gas_contribution REAL NOT NULL,
      flash_contribution REAL NOT NULL,
      execution_contribution REAL NOT NULL,
      liquidity TEXT NOT NULL,
      dex_buy TEXT NOT NULL,
      dex_sell TEXT NOT NULL
    );
  `;

  const createIndexSQL = `
    CREATE INDEX IF NOT EXISTS idx_timestamp ON opportunities(timestamp);
  `;

  db.exec(createTableSQL);
  db.exec(createIndexSQL);

  console.log(`Database initialized at ${dbPath}`);
}

export function saveOpportunity(opportunity: Opportunity): number {
  const [dex_buy, dex_sell] = opportunity.route.split(" -> ");

  const stmt = db.prepare(`
    INSERT INTO opportunities (
      timestamp,
      token,
      route,
      size,
      gross_profit,
      gas_cost,
      flash_fee,
      net_profit,
      buy_price,
      sell_price,
      spread_percent,
      slippage_impact,
      spread_contribution,
      gas_contribution,
      flash_contribution,
      execution_contribution,
      liquidity,
      dex_buy,
      dex_sell
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    Math.floor(Date.now() / 1000),
    opportunity.token,
    opportunity.route,
    opportunity.size,
    opportunity.grossProfit,
    opportunity.gasCost,
    opportunity.flashFee,
    opportunity.netProfit,
    opportunity.buyPrice,
    opportunity.sellPrice,
    opportunity.spreadPercent,
    opportunity.slippageImpact,
    opportunity.spreadContribution,
    opportunity.gasContribution,
    opportunity.flashContribution,
    opportunity.executionContribution,
    opportunity.liquidity,
    dex_buy,
    dex_sell
  );

  return result.lastInsertRowid as number;
}

export function getOpportunitiesSince(secondsAgo: number): StoredOpportunity[] {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - secondsAgo;

  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
  `);

  return stmt.all(cutoffTimestamp) as StoredOpportunity[];
}

export function getOpportunitiesBetween(
  startTimestamp: number,
  endTimestamp: number
): StoredOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
  `);

  return stmt.all(startTimestamp, endTimestamp) as StoredOpportunity[];
}

export function getAllOpportunities(): StoredOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    ORDER BY timestamp DESC
  `);

  return stmt.all() as StoredOpportunity[];
}

export function getOpportunitiesForToken(token: string): StoredOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE token = ?
    ORDER BY timestamp DESC
  `);

  return stmt.all(token) as StoredOpportunity[];
}

export function getOpportunitiesForRoute(route: string): StoredOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE route = ?
    ORDER BY timestamp DESC
  `);

  return stmt.all(route) as StoredOpportunity[];
}

export function getOpportunitiesForDex(dex: string): StoredOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM opportunities
    WHERE dex_buy = ? OR dex_sell = ?
    ORDER BY timestamp DESC
  `);

  return stmt.all(dex, dex) as StoredOpportunity[];
}

export function countOpportunitiesSince(secondsAgo: number): number {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - secondsAgo;

  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM opportunities
    WHERE timestamp >= ?
  `);

  const result = stmt.get(cutoffTimestamp) as { count: number };
  return result.count;
}

export function clearOldOpportunities(daysOld: number): number {
  const cutoffTimestamp =
    Math.floor(Date.now() / 1000) - daysOld * 24 * 60 * 60;

  const stmt = db.prepare(`
    DELETE FROM opportunities
    WHERE timestamp < ?
  `);

  const result = stmt.run(cutoffTimestamp);
  return result.changes;
}

export function closeDatabase() {
  db.close();
}

export interface TokenBreakdown {
  token: string;
  count: number;
  avg_spread: number;
  avg_slippage: number;
  avg_net_profit: number;
  min_spread: number;
  max_spread: number;
  profitable_count: number;
}

export function getTokenBreakdown(): TokenBreakdown[] {
  const stmt = db.prepare(`
    SELECT
      token,
      COUNT(*) as count,
      ROUND(AVG(spread_percent), 4) as avg_spread,
      ROUND(AVG(slippage_impact), 2) as avg_slippage,
      ROUND(AVG(net_profit), 2) as avg_net_profit,
      ROUND(MIN(spread_percent), 4) as min_spread,
      ROUND(MAX(spread_percent), 4) as max_spread,
      SUM(CASE WHEN net_profit > 0 THEN 1 ELSE 0 END) as profitable_count
    FROM opportunities
    GROUP BY token
    ORDER BY avg_net_profit DESC
  `);

  return stmt.all() as TokenBreakdown[];
}

// Day 17: Attribution analytics

export interface TokenAttribution {
  token: string;
  count: number;
  avg_spread_contribution_pct: number; // As percentage of size
  avg_gas_contribution_pct: number;
  avg_flash_contribution_pct: number;
  avg_execution_contribution_pct: number;
  avg_net_profit_pct: number;
  profitable_count: number;
}

export function getTokenAttribution(): TokenAttribution[] {
  const stmt = db.prepare(`
    SELECT
      token,
      COUNT(*) as count,
      ROUND(AVG(spread_contribution / size * 100), 4) as avg_spread_contribution_pct,
      ROUND(AVG(gas_contribution / size * 100), 4) as avg_gas_contribution_pct,
      ROUND(AVG(flash_contribution / size * 100), 4) as avg_flash_contribution_pct,
      ROUND(AVG(execution_contribution / size * 100), 4) as avg_execution_contribution_pct,
      ROUND(AVG(net_profit / size * 100), 4) as avg_net_profit_pct,
      SUM(CASE WHEN net_profit > 0 THEN 1 ELSE 0 END) as profitable_count
    FROM opportunities
    GROUP BY token
    ORDER BY avg_net_profit_pct DESC
  `);

  return stmt.all() as TokenAttribution[];
}

export interface RouteAttribution {
  route: string;
  count: number;
  avg_spread_contribution_pct: number;
  avg_gas_contribution_pct: number;
  avg_flash_contribution_pct: number;
  avg_execution_contribution_pct: number;
  avg_net_profit_pct: number;
  profitable_count: number;
}

export function getRouteAttribution(): RouteAttribution[] {
  const stmt = db.prepare(`
    SELECT
      route,
      COUNT(*) as count,
      ROUND(AVG(spread_contribution / size * 100), 4) as avg_spread_contribution_pct,
      ROUND(AVG(gas_contribution / size * 100), 4) as avg_gas_contribution_pct,
      ROUND(AVG(flash_contribution / size * 100), 4) as avg_flash_contribution_pct,
      ROUND(AVG(execution_contribution / size * 100), 4) as avg_execution_contribution_pct,
      ROUND(AVG(net_profit / size * 100), 4) as avg_net_profit_pct,
      SUM(CASE WHEN net_profit > 0 THEN 1 ELSE 0 END) as profitable_count
    FROM opportunities
    GROUP BY route
    ORDER BY avg_net_profit_pct DESC
  `);

  return stmt.all() as RouteAttribution[];
}

export interface BottleneckAnalysis {
  bottleneck: string;
  total_loss_pct: number;
  percentage_of_total: number;
}

export function getBottleneckAnalysis(): BottleneckAnalysis[] {
  // Calculate total average impact of each component
  const stmt = db.prepare(`
    SELECT
      'Execution Slippage' as bottleneck,
      ABS(AVG(execution_contribution / size * 100)) as total_loss_pct
    FROM opportunities
    UNION ALL
    SELECT
      'Gas Cost' as bottleneck,
      ABS(AVG(gas_contribution / size * 100)) as total_loss_pct
    FROM opportunities
    UNION ALL
    SELECT
      'Flash Fee' as bottleneck,
      ABS(AVG(flash_contribution / size * 100)) as total_loss_pct
    FROM opportunities
  `);

  const results = stmt.all() as Array<{ bottleneck: string; total_loss_pct: number }>;
  const totalLoss = results.reduce((sum, r) => sum + r.total_loss_pct, 0);

  return results
    .map(r => ({
      bottleneck: r.bottleneck,
      total_loss_pct: r.total_loss_pct,
      percentage_of_total: (r.total_loss_pct / totalLoss) * 100
    }))
    .sort((a, b) => b.percentage_of_total - a.percentage_of_total);
}
