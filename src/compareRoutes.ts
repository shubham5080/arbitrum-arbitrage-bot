import { ethers } from "ethers";
import dotenv from "dotenv";

import { DEXES } from "./config/dexes";
import { TOKENS } from "./config/tokens";
import { POOLS } from "./config/pools";
import {
  getSushiBuyQuote,
  getSushiSellQuote,
  getUniswapBuyQuote,
  getUniswapSellQuote,
} from "./quotes/quoteEngine";

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
  const results: Array<{
    size: number;
    sushiToUni: number;
    uniToSushi: number;
    bestRoute: string;
  }> = [];

  const opportunities: Array<{
    route: string;
    size: number;
    profit: number;
  }> = [];

  const weth = TOKENS.WETH;
  const wethPools = POOLS.WETH as any;
  const sushiPoolAddress = wethPools[DEXES.SUSHI].address;
  const uniswapPoolAddress = wethPools[DEXES.UNISWAP].address;

  for (const size of sizes) {
    const sushiWethOut = await getSushiBuyQuote(
      provider,
      weth.address,
      weth.decimals,
      size.toString(),
      sushiPoolAddress
    );
    const sushiFinalUsdc = await getUniswapSellQuote(
      provider,
      weth.address,
      weth.decimals,
      ethers.formatUnits(sushiWethOut, weth.decimals),
      uniswapPoolAddress
    );
    const sushiFinalNumber = Number(ethers.formatUnits(sushiFinalUsdc, 6));
    const sushiProfit = sushiFinalNumber - size;

    const uniWethOut = await getUniswapBuyQuote(
      provider,
      weth.address,
      weth.decimals,
      size.toString(),
      uniswapPoolAddress
    );
    const uniFinalUsdc = await getSushiSellQuote(
      provider,
      weth.address,
      weth.decimals,
      ethers.formatUnits(uniWethOut, weth.decimals),
      sushiPoolAddress
    );
    const uniFinalNumber = Number(ethers.formatUnits(uniFinalUsdc, 6));
    const uniProfit = uniFinalNumber - size;

    const bestRoute =
      uniProfit > sushiProfit
        ? "Uni -> Sushi"
        : sushiProfit > uniProfit
        ? "Sushi -> Uni"
        : "Tie";

    results.push({
      size,
      sushiToUni: Number(sushiProfit.toFixed(2)),
      uniToSushi: Number(uniProfit.toFixed(2)),
      bestRoute,
    });

    opportunities.push({ route: "Sushi -> Uni", size, profit: sushiProfit });
    opportunities.push({ route: "Uni -> Sushi", size, profit: uniProfit });
  }

  console.log("Trade Size Results:");
  console.table(results);

  const sorted = opportunities.sort((a, b) => b.profit - a.profit);

  console.log("Top Opportunities");
  console.log("-----------------");
  sorted.slice(0, 5).forEach((op, index) => {
    console.log(`${index + 1}. ${op.route}`);
    console.log(`   Size: ${op.size}`);
    console.log(`   Profit: ${op.profit.toFixed(2)}`);
  });
}

main().catch(console.error);
