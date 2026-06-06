import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const POOL_ADDRESS =
  "0xc6962004f452be9203591991d15f6b388e09e8d0";

const ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns(address)",
  "function token1() view returns(address)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

  const pool = new ethers.Contract(POOL_ADDRESS, ABI, provider);

  const slot0 = await (pool as any).slot0();

  const token0 = await (pool as any).token0();
  const token1 = await (pool as any).token1();

  console.log("token0:", token0);
  console.log("token1:", token1);

  // Convert sqrtPriceX96 to raw price
  const sqrtPriceX96 = BigInt(slot0[0].toString());
  const Q96 = 2n ** 96n;

  // Convert to floating point for display
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const rawPrice = sqrtPrice * sqrtPrice;

  console.log("rawPrice:", rawPrice);

  // Fetch token decimals to compute adjusted price (token0/token1)
  const ERC20 = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];
  const token0Contract = new ethers.Contract(token0, ERC20, provider) as any;
  const token1Contract = new ethers.Contract(token1, ERC20, provider) as any;

  let dec0 = 18;
  let dec1 = 18;
  try {
    dec0 = Number(await token0Contract.decimals());
  } catch (e) {
    // leave default
  }
  try {
    dec1 = Number(await token1Contract.decimals());
  } catch (e) {
    // leave default
  }

  const adjustedPrice = rawPrice * Math.pow(10, dec0 - dec1);
  console.log("adjustedPrice (token0/token1 decimals applied):", adjustedPrice);
  // Explicit 10^12 adjustment for WETH/USDC sanity check
  const adjustedPriceBy1e12 = rawPrice * 1e12;
  console.log("Adjusted Price:", adjustedPriceBy1e12);
  console.log("tick:", slot0[1].toString());
}

main().catch(console.error);
