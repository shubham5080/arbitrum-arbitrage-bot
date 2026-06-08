import { ethers } from "ethers";
import dotenv from "dotenv";

import { DEXES } from "./config/dexes";
import { TOKENS } from "./config/tokens";
import { poolMetadataFromConfig } from "./config/poolMetadataFromConfig";
import { getUniswapBuyQuote, getSushiSellQuote } from "./quotes/quoteEngine";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const sizes = [
  100,
  250,
  500,
  1000,
  2500,
  5000,
  10000,
  25000,
  50000,
];

async function main() {
  const results: Array<{ Size: number; Final: string; Profit: string }> = [];

  const weth = TOKENS.WETH;
  const sushiPool = poolMetadataFromConfig("WETH", DEXES.SUSHI);
  const uniswapPool = poolMetadataFromConfig("WETH", DEXES.UNISWAP);
  if (!sushiPool || !uniswapPool) {
    throw new Error("WETH pool metadata not configured");
  }

  for (const size of sizes) {
    const wethOut = await getUniswapBuyQuote(
      provider,
      weth.address,
      weth.decimals,
      size.toString(),
      uniswapPool.feeTier
    );
    const finalUsdc = await getSushiSellQuote(
      provider,
      weth.address,
      weth.decimals,
      ethers.formatUnits(wethOut, weth.decimals),
      sushiPool
    );

    const finalUsdcNumber = Number(ethers.formatUnits(finalUsdc, 6));
    const profit = finalUsdcNumber - size;

    results.push({
      Size: size,
      Final: finalUsdcNumber.toFixed(2),
      Profit: profit >= 0 ? `+${profit.toFixed(2)}` : profit.toFixed(2),
    });
  }

  console.table(results);
}

main().catch(console.error);
