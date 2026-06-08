import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { TriangleSimulator } from "./triangleSimulator";
import { generateRoutes, routeName } from "./routeGenerator";
import { findBestSushiPool } from "../../discovery/sushiPoolDiscovery";
import { findBestCamelotPool } from "../../discovery/camelotPoolDiscovery";
import { TOKENS } from "../../config/tokens";
import { ADDRESSES } from "../../config/addresses";

const RPC_URL = "https://arb1.arbitrum.io/rpc";
const logPath = path.join(process.cwd(), "logs/triangle_results.jsonl");
const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
const unique = new Map<string, { route: string; dexCombo: string; initialAmount: number }>();

for (const line of lines) {
  const entry = JSON.parse(line);
  if (entry.spread < -5) {
    const key = `${entry.route}|${entry.dexCombo}|${entry.initialAmount}`;
    if (!unique.has(key)) {
      unique.set(key, { route: entry.route, dexCombo: entry.dexCombo, initialAmount: entry.initialAmount });
    }
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const simulator = new TriangleSimulator(provider);
  const routes = generateRoutes();
  const camelotPoolWETH_USDC = await findBestCamelotPool(provider, TOKENS.WETH.address, ADDRESSES.USDC);

  for (const { route, dexCombo, initialAmount } of Array.from(unique.values())) {
    const routeObj = routes.find((r) => routeName(r) === route);
    if (!routeObj) {
      console.error("Could not match route", route);
      continue;
    }

    const [leg1, leg2, leg3] = dexCombo.split("->") as [string, string, string];
    const sushiPoolStartMiddle = await findBestSushiPool(provider, routeObj.startToken, routeObj.middleToken);
    const sushiPoolMiddleEnd = await findBestSushiPool(provider, routeObj.middleToken, routeObj.endToken);
    const poolAddresses: any = {};
    if (leg1 === "sushi" && sushiPoolStartMiddle?.poolAddress) poolAddresses.leg1 = sushiPoolStartMiddle.poolAddress;
    if (leg2 === "sushi" && sushiPoolMiddleEnd?.poolAddress) poolAddresses.leg2 = sushiPoolMiddleEnd.poolAddress;
    if (leg3 === "camelot" && camelotPoolWETH_USDC?.poolAddress) poolAddresses.leg3 = camelotPoolWETH_USDC.poolAddress;

    console.log("---");
    console.log({ route, dexCombo, initialAmount });
    try {
      const result = await simulator.simulateTriangle(routeObj, initialAmount, leg1, leg2, leg3, poolAddresses);
      console.log(JSON.stringify({
        route,
        dexCombo,
        initialAmount,
        profit: result.grossProfit,
        spread: result.profitPercent,
        legPoolAddresses: [result.leg1.poolAddress, result.leg2.poolAddress, result.leg3.poolAddress],
        legFeeTiers: [result.leg1.feeTier, result.leg2.feeTier, result.leg3.feeTier],
        legLiquidities: [result.leg1.liquidity, result.leg2.liquidity, result.leg3.liquidity],
      }, null, 2));
    } catch (err) {
      console.error("Rerun failed", err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
