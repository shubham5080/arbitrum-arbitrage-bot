import { scanMarket } from "./scanMarket";

async function main() {
  const opportunities = await scanMarket();
  const sorted = opportunities.sort((a, b) => b.netProfit - a.netProfit);
  console.table(sorted.slice(0, 20));
}

main().catch(console.error);
