import fs from "fs";
import path from "path";

const OUT = path.join(__dirname, "../../logs/rejected_routes.jsonl");

export function logRejectedRoute(entry: {
  timestamp?: number;
  tokenPath?: string[]; // token addresses
  poolAddress: string;
  liquidity?: bigint | string | number | null;
  reason: string;
}) {
  const e = Object.assign({ timestamp: Math.floor(Date.now() / 1000) }, entry);
  try {
    // ensure logs directory exists
    const dir = path.dirname(OUT);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // stringify BigInt values as strings for portability
    const json = JSON.stringify(e, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    fs.appendFileSync(OUT, json + "\n");
  } catch (err) {
    // best-effort logging
    console.debug("Failed to write rejected route log", err);
  }
}

export default logRejectedRoute;
