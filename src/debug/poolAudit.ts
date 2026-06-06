import { ethers } from "ethers";
import dotenv from "dotenv";
import { DEXES } from "../config/dexes";
import { POOLS } from "../config/pools";
import { getPoolLiquidity, isPoolTradable } from "../validation/poolValidator";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

async function main() {
  for (const [symbol, poolConfig] of Object.entries(POOLS)) {
    console.log(symbol);

    for (const dex of [DEXES.UNISWAP, DEXES.SUSHI]) {
      const poolEntry = (poolConfig as any)[dex];
      if (!poolEntry) {
        console.log(`${dex}: no pool configured`);
        continue;
      }

      const liquidity = await getPoolLiquidity(provider, poolEntry.address);
      const tradable = await isPoolTradable(provider, poolEntry.address);
      const status = tradable ? "OK" : "Rejected";

      console.log(`${dex} ${poolEntry.fee}: ${liquidity} ${status}`);
    }

    console.log("");
  }
}

main().catch(console.error);
