import { ethers } from "ethers";
import dotenv from "dotenv";
import { initializeDatabase, closeDatabase } from "../database/database";
import { initializeTriangularTables } from "./triangularDatabase";
import { runPriorityTriangleScan, runWethTriangleScan } from "./triangleEngine";
import { getTriangularProfitabilityStats } from "./triangularDatabase";

dotenv.config();

const DEFAULT_INTERVAL_MS = 15_000;

export interface TriangleMonitorOptions {
  intervalMs?: number;
  maxCycles?: number;
  mode?: "priority" | "weth";
  tradeSizeUsd?: number;
}

export async function runTriangleMonitor(options: TriangleMonitorOptions = {}) {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL required");

  initializeDatabase();
  initializeTriangularTables();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxCycles = options.maxCycles ?? Infinity;
  const mode = options.mode ?? "priority";
  let cycle = 0;

  const shutdown = () => {
    console.log("\nShutting down triangle monitor...");
    closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`Triangle monitor started (mode=${mode}, interval=${intervalMs}ms)`);

  while (cycle < maxCycles) {
    cycle += 1;
    const start = Date.now();
    try {
      const report =
        mode === "weth"
          ? await runWethTriangleScan(provider, [options.tradeSizeUsd ?? 10_000], true)
          : await runPriorityTriangleScan(provider, true);

      const stats = getTriangularProfitabilityStats();
      console.log(
        `[${new Date().toISOString()}] cycle ${cycle}: evaluated=${report.routesEvaluated} ` +
          `quoted=${report.quotesSucceeded} profitable=${report.profitable} ` +
          `best=$${report.best?.netProfit?.toFixed(2) ?? "—"} ` +
          `db_total=${stats.total}`
      );
    } catch (err) {
      console.error(`Cycle ${cycle} failed:`, err);
    }

    if (cycle < maxCycles) {
      const elapsed = Date.now() - start;
      await new Promise((r) => setTimeout(r, Math.max(0, intervalMs - elapsed)));
    }
  }

  closeDatabase();
}

async function main() {
  const intervalMs = process.argv[2] ? parseInt(process.argv[2], 10) : DEFAULT_INTERVAL_MS;
  const maxCycles = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;
  const mode = (process.argv[4] as "priority" | "weth") ?? "priority";

  await runTriangleMonitor({ intervalMs, maxCycles, mode });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
