import { ethers } from "ethers";
import dotenv from "dotenv";

import { DEXES } from "./config/dexes";
import { POOLS } from "./config/pools";
import { TOKENS } from "./config/tokens";
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
  const wethPools = POOLS.WETH as any;
  const sushiPoolAddress = wethPools[DEXES.SUSHI].address;
  const uniswapPoolAddress = wethPools[DEXES.UNISWAP].address;

  for (const size of sizes) {
    const wethOut = await getUniswapBuyQuote(
      provider,
      weth.address,
      weth.decimals,
      size.toString(),
      uniswapPoolAddress
    );
    const finalUsdc = await getSushiSellQuote(
      provider,
      weth.address,
      weth.decimals,
      ethers.formatUnits(wethOut, weth.decimals),
      sushiPoolAddress
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
