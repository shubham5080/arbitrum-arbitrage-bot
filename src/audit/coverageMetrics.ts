import dotenv from "dotenv";
import { ethers } from "ethers";
import { TOKENS } from "../config/tokens";
import { DEXES } from "../config/dexes";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";
import { isPoolTradable } from "../validation/poolValidator";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

async function main() {
  console.log("\n=== Day 15 Scanner Expansion: Coverage Metrics ===\n");

  const sizes = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  const tokenSymbols = Object.keys(TOKENS);
  const dexList = [DEXES.UNISWAP, DEXES.SUSHI]; // Track A: only Uni + Sushi for now

  console.log(`Configured tokens: ${tokenSymbols.join(", ")}`);
  console.log(`DEXes: ${dexList.join(", ")}`);
  console.log(`Trade sizes: ${sizes.length} tiers`);
  console.log();

  let totalTokensScanned = 0;
  let totalDexPairs = 0;
  let totalRoutes = 0;

  const results: { token: string; dexes: string[]; routes: number }[] = [];

  for (const symbol of tokenSymbols) {
    console.log(`Scanning ${symbol}...`);
    const activeDexes: string[] = [];

    for (const dex of dexList) {
      const pool = await getHighestLiquidityPoolForDex(provider, symbol, dex);
      if (pool) {
        const tradable = await isPoolTradable(provider, pool.poolAddress);
        if (tradable) {
          console.log(`  ✅ ${dex}: found pool at ${pool.poolAddress.slice(0, 10)}... (liquidity: ${pool.liquidity.toString()})`);
          activeDexes.push(dex);
        } else {
          console.log(`  ⚠️  ${dex}: pool exists but liquidity too low`);
        }
      } else {
        console.log(`  ❌ ${dex}: no pool found`);
      }
    }

    if (activeDexes.length >= 2) {
      totalTokensScanned++;
      // ordered pairs where buy != sell
      const pairs = activeDexes.length * (activeDexes.length - 1);
      const routesForToken = pairs * sizes.length;
      totalDexPairs += pairs;
      totalRoutes += routesForToken;
      results.push({ token: symbol, dexes: activeDexes, routes: routesForToken });
    }
  }

  console.log("\n=== Summary ===\n");
  console.log(`Tokens with 2+ tradable DEX pairs: ${totalTokensScanned}`);
  console.log(`DEX pair combinations: ${totalDexPairs}`);
  console.log(`Trade sizes per route: ${sizes.length}`);
  console.log(`Total route evaluations: ${totalRoutes}\n`);

  console.log("Breakdown by token:");
  for (const r of results) {
    console.log(`  ${r.token}: ${r.dexes.join(" ↔ ")} = ${r.routes} evaluations`);
  }

  console.log(`\n✅ Day 15 expansion complete: ${totalRoutes} route evaluations per scan cycle`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
