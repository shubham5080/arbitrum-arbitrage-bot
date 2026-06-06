import { ethers } from "ethers";

const POOL =
  "0xc6962004f452be9203591991d15f6b388e09e8d0";

const ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"
];

export async function getUniswapPrice(
  provider: ethers.Provider
) {
  const pool = new ethers.Contract(POOL, ABI, provider);

  const slot0 = await (pool as any).slot0();

  const sqrtPriceX96 = BigInt(slot0[0].toString());

  const Q96 = 2n ** 96n;

  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);

  const price = sqrtPrice * sqrtPrice;

  return price * 1e12;
}
