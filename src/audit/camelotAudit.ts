import dotenv from "dotenv";
import { ethers } from "ethers";
import { TOKENS } from "../config/tokens";
import { DEXES } from "../config/dexes";
import { ADDRESSES } from "../config/addresses";
import { findBestCamelotPool } from "../discovery/camelotPoolDiscovery";
import { getPoolLiquidity, isPoolTradable } from "../validation/poolValidator";
import { getCamelotBuyQuote, getCamelotSellQuote } from "../quotes/camelotQuote";
import { getHighestLiquidityPoolForDex } from "../discovery/bestPoolFinder";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

async function auditCamelotForToken(symbol: string) {
  const token = (TOKENS as any)[symbol];
  if (!token) {
    console.log(`Token ${symbol} not found in TOKENS`);
    return;
  }

  console.log(`\n=== Camelot audit for ${symbol} ===`);
  console.log(`Token address: ${token.address}`);
  console.log(`Token decimals: ${token.decimals}`);
  console.log(`USDC address: ${ADDRESSES.USDC}`);

  try {
    console.log("Searching for Camelot pool...");
    const pool = await findBestCamelotPool(provider, token.address, ADDRESSES.USDC);
    if (!pool) {
      console.log("❌ No Camelot pool found for token.");
      return;
    }

    console.log(`✅ Pool found: ${pool.poolAddress}`);
    const liquidity = await getPoolLiquidity(provider, pool.poolAddress);
    console.log(`Liquidity: ${liquidity.toString()}`);
    console.log(`Fee: ${pool.feeTier}`);

    // Buy: 100 USDC -> token
    let buyOut = "N/A";
    let sellOut = "N/A";

    try {
      console.log("Fetching buy quote (100 USDC -> token)...");
      const buy = await getCamelotBuyQuote(provider, token.address, token.decimals, "100", pool.poolAddress);
      buyOut = ethers.formatUnits(buy, token.decimals);
      console.log(`Buy Quote: 100 USDC -> ${buyOut} ${symbol}`);
    } catch (e) {
      buyOut = `❌ buy quote failed: ${String(e)}`;
      console.log(buyOut);
    }

    try {
      console.log("Fetching sell quote (1 token -> USDC)...");
      const sell = await getCamelotSellQuote(provider, token.address, token.decimals, "1.0", pool.poolAddress);
      sellOut = ethers.formatUnits(sell, 6);
      console.log(`Sell Quote: 1 ${symbol} -> ${sellOut} USDC`);
    } catch (e) {
      sellOut = `❌ sell quote failed: ${String(e)}`;
      console.log(sellOut);
    }
  } catch (err) {
    console.error(`❌ Error auditing ${symbol}:`, err);
  }
}

async function routeCoverage() {
  console.log("\n=== Route coverage metrics ===");

  const sizes = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  const tokenSymbols = Object.keys(TOKENS);
  const dexList = Object.values(DEXES) as string[];

  let tokensScanned = 0;
  let dexPairsScanned = 0;
  let routesEvaluated = 0;

  for (const symbol of tokenSymbols) {
    tokensScanned++;

    const activeDexes: string[] = [];
    for (const dex of dexList) {
      const pool = await getHighestLiquidityPoolForDex(provider, symbol, dex);
      if (pool) {
        const tradable = await isPoolTradable(provider, pool.poolAddress);
        if (tradable) {
          activeDexes.push(dex);
        }
      }
    }

    // ordered pairs where buy != sell
    const pairs = activeDexes.length * (activeDexes.length - 1);
    dexPairsScanned += pairs;
    routesEvaluated += pairs * sizes.length;
  }

  console.log(`Tokens: ${tokensScanned}`);
  console.log(`DEXes considered: ${dexList.length}`);
  console.log(`DEX pairs (ordered) scanned across tokens: ${dexPairsScanned}`);
  console.log(`Trade sizes tested: ${sizes.length}`);
  console.log(`Total route evaluations (approx): ${routesEvaluated}`);
}

async function main() {
  // Audit specific tokens on Camelot
  const auditTokens = ["WETH", "ARB", "LINK"];
  for (const t of auditTokens) {
    await auditCamelotForToken(t);
  }

  // Route coverage across all configured tokens/dexes
  await routeCoverage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
