import { ethers } from "ethers";
import dotenv from "dotenv";

import { getUniswapPrice } from "./dex/uniswap";
import { getSushiPrice } from "./dex/sushi";

dotenv.config();

async function main() {
  const provider = new ethers.JsonRpcProvider(
    process.env.RPC_URL
  );

  const uniPrice = await getUniswapPrice(provider);
  const sushiPrice = await getSushiPrice(provider);

  console.log("Uniswap:", uniPrice);
  console.log("Sushi:", sushiPrice);

  const spread = ((sushiPrice - uniPrice) / uniPrice) * 100;
  console.log("Spread:", spread.toFixed(4), "%");
}

main().catch(console.error);
