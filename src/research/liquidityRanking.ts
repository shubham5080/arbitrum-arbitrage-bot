import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { getPoolLiquidity } from "../validation/poolValidator";
import { fetchPoolTokens } from "../discovery/poolMetadataHelpers";
import { ResearchToken } from "./arbitrumUniverse";

const FEES = [500, 3000, 10000];
const FACTORY_ABI = ["function getPool(address,address,uint24) external view returns (address)"];

export interface PoolLiquidityRank {
  token: string;
  dex: string;
  poolAddress: string;
  feeTier: number;
  liquidity: bigint;
  token0: string;
  token1: string;
}

async function bestV3Pool(
  provider: ethers.Provider,
  factoryAddress: string,
  dex: string,
  tokenA: string,
  tokenB: string
): Promise<PoolLiquidityRank | null> {
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider) as any;
  let best: PoolLiquidityRank | null = null;

  for (const fee of FEES) {
    try {
      const poolAddress = await factory.getPool(tokenA, tokenB, fee);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) continue;

      const liquidity = await getPoolLiquidity(provider, poolAddress);
      if (liquidity === 0n) continue;

      const { token0, token1 } = await fetchPoolTokens(provider, poolAddress);
      const entry: PoolLiquidityRank = {
        token: "",
        dex,
        poolAddress,
        feeTier: fee,
        liquidity,
        token0,
        token1,
      };

      if (!best || liquidity > best.liquidity) {
        best = entry;
      }
    } catch {
      continue;
    }
  }

  return best;
}

const V3_FACTORIES: { dex: string; factory: string }[] = [
  { dex: "UNISWAP", factory: ADDRESSES.UNISWAP_V3_FACTORY },
  { dex: "SUSHI", factory: ADDRESSES.SUSHI_V3_FACTORY },
  { dex: "CAMELOT", factory: ADDRESSES.CAMELOT_AMMV2_FACTORY },
  { dex: "PANCAKESWAP", factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" },
];

export async function rankTokenLiquidity(
  provider: ethers.Provider,
  token: ResearchToken,
  quoteToken = ADDRESSES.USDC
): Promise<PoolLiquidityRank[]> {
  const ranks: PoolLiquidityRank[] = [];

  if (token.symbol === "USDC") {
    return ranks;
  }

  for (const { dex, factory } of V3_FACTORIES) {
    const pool = await bestV3Pool(provider, factory, dex, token.address, quoteToken);
    if (pool) {
      ranks.push({ ...pool, token: token.symbol });
    }
  }

  return ranks.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));
}

export async function rankAllTokenLiquidity(
  provider: ethers.Provider,
  tokens: ResearchToken[]
): Promise<PoolLiquidityRank[]> {
  const all: PoolLiquidityRank[] = [];

  for (const token of tokens) {
    if (token.symbol === "USDC") continue;
    const ranks = await rankTokenLiquidity(provider, token);
    all.push(...ranks);
  }

  return all.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));
}

export function summarizeDexCoverage(ranks: PoolLiquidityRank[]) {
  const byDex = new Map<string, number>();
  for (const r of ranks) {
    byDex.set(r.dex, (byDex.get(r.dex) ?? 0) + 1);
  }
  return Object.fromEntries(byDex);
}
