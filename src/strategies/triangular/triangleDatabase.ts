/**
 * Day 18: Triangle Opportunity Database
 * 
 * Stores and retrieves triangular arbitrage opportunities
 */

import Database from "better-sqlite3";
import path from "path";
import { StoredTriangleOpportunity, TriangleSimulationResult } from "./types";

const dbPath = path.join(__dirname, "../../arbitrage.db");
const db = new Database(dbPath);

export function initializeTriangleTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS triangle_opportunities (
      id INTEGER PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      start_token TEXT NOT NULL,
      middle_token TEXT NOT NULL,
      end_token TEXT NOT NULL,
      route_name TEXT NOT NULL,
      
      initial_amount REAL NOT NULL,
      final_amount REAL NOT NULL,
      gross_profit REAL NOT NULL,
      profit_percent REAL NOT NULL,
      
      leg1_dex TEXT NOT NULL,
      leg1_price REAL NOT NULL,
      leg2_dex TEXT NOT NULL,
      leg2_price REAL NOT NULL,
      leg3_dex TEXT NOT NULL,
      leg3_price REAL NOT NULL,
      
      execution_time_ms INTEGER
    );
  `;

  const createIndexSQL = `
    CREATE INDEX IF NOT EXISTS idx_triangle_timestamp ON triangle_opportunities(timestamp);
  `;

  const createIndexRouteSQL = `
    CREATE INDEX IF NOT EXISTS idx_triangle_route ON triangle_opportunities(route_name);
  `;

  const createIndexProfitSQL = `
    CREATE INDEX IF NOT EXISTS idx_triangle_profit ON triangle_opportunities(profit_percent);
  `;

  db.exec(createTableSQL);
  db.exec(createIndexSQL);
  db.exec(createIndexRouteSQL);
  db.exec(createIndexProfitSQL);

  console.log("Triangle opportunities table initialized");
}

/**
 * Save a triangle simulation result to the database
 */
export function saveTriangleOpportunity(
  simulation: TriangleSimulationResult
): number {
  const routeName = `${simulation.route.startToken.slice(0, 6)}...${simulation.route.startToken.slice(-4)}→${simulation.route.middleToken.slice(0, 6)}...${simulation.route.middleToken.slice(-4)}→${simulation.route.endToken.slice(0, 6)}...${simulation.route.endToken.slice(-4)}→USDC`;

  const stmt = db.prepare(`
    INSERT INTO triangle_opportunities (
      timestamp,
      start_token,
      middle_token,
      end_token,
      route_name,
      initial_amount,
      final_amount,
      gross_profit,
      profit_percent,
      leg1_dex,
      leg1_price,
      leg2_dex,
      leg2_price,
      leg3_dex,
      leg3_price,
      execution_time_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    simulation.timestamp,
    simulation.route.startToken,
    simulation.route.middleToken,
    simulation.route.endToken,
    routeName,
    simulation.initialAmount,
    simulation.finalAmount,
    simulation.grossProfit,
    simulation.profitPercent,
    simulation.leg1.dex,
    simulation.leg1.priceExecuted,
    simulation.leg2.dex,
    simulation.leg2.priceExecuted,
    simulation.leg3.dex,
    simulation.leg3.priceExecuted,
    simulation.executionTime
  );

  return (result.lastInsertRowid as number) || 0;
}

/**
 * Get all triangle opportunities sorted by profit %
 */
export function getTopTriangleOpportunities(
  limit: number = 10
): StoredTriangleOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM triangle_opportunities
    ORDER BY profit_percent DESC
    LIMIT ?
  `);

  return stmt.all(limit) as StoredTriangleOpportunity[];
}

/**
 * Get triangle opportunities for a specific route
 */
export function getTriangleOpportunitiesByRoute(
  routeName: string,
  limit: number = 100
): StoredTriangleOpportunity[] {
  const stmt = db.prepare(`
    SELECT * FROM triangle_opportunities
    WHERE route_name = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(routeName, limit) as StoredTriangleOpportunity[];
}

/**
 * Get statistics on triangle opportunities
 */
export function getTriangleStatistics(): {
  totalOpportunities: number;
  averageProfit: number;
  maxProfit: number;
  minProfit: number;
  profitableCount: number;
} {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      AVG(profit_percent) as avg_profit,
      MAX(profit_percent) as max_profit,
      MIN(profit_percent) as min_profit,
      SUM(CASE WHEN profit_percent > 0 THEN 1 ELSE 0 END) as profitable_count
    FROM triangle_opportunities
  `);

  const result = stmt.get() as {
    total: number;
    avg_profit: number;
    max_profit: number;
    min_profit: number;
    profitable_count: number;
  };

  return {
    totalOpportunities: result.total,
    averageProfit: result.avg_profit || 0,
    maxProfit: result.max_profit || 0,
    minProfit: result.min_profit || 0,
    profitableCount: result.profitable_count || 0,
  };
}

/**
 * Get most profitable routes (by average profit)
 */
export function getMostProfitableRoutes(
  limit: number = 10
): Array<{ routeName: string; avgProfit: number; count: number }> {
  const stmt = db.prepare(`
    SELECT 
      route_name as routeName,
      AVG(profit_percent) as avgProfit,
      COUNT(*) as count
    FROM triangle_opportunities
    GROUP BY route_name
    ORDER BY avgProfit DESC
    LIMIT ?
  `);

  return stmt.all(limit) as Array<{
    routeName: string;
    avgProfit: number;
    count: number;
  }>;
}
