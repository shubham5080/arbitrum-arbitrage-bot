/**
 * Day 18: Triangle Arbitrage Strategy
 * 
 * Exports all triangular arbitrage components
 */

export type {
  TriangleRoute,
  TriangleSimulationResult,
  RouteLegResult,
  StoredTriangleOpportunity,
} from "./types";

export { TriangleSimulator } from "./triangleSimulator";

export {
  initializeTriangleTable,
  saveTriangleOpportunity,
  getTopTriangleOpportunities,
  getTriangleOpportunitiesByRoute,
  getTriangleStatistics,
  getMostProfitableRoutes,
} from "./triangleDatabase";
