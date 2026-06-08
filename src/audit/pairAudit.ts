import { ethers } from "ethers";
import { TOKENS } from "../config/tokens";
import { ADDRESSES } from "../config/addresses";
import { findBestSushiPool } from "../discovery/sushiPoolDiscovery";

const RPC_URL = "https://arb1.arbitrum.io/rpc";

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

function formatBig(value: bigint | string | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "bigint" ? value.toString() : value;
}

async function inspectPair(provider: ethers.Provider, poolAddress: string) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  const info: any = { poolAddress };

  try {
    info.token0 = await pool.token0();
    info.token1 = await pool.token1();
  } catch (err) {
    info.tokenError = String(err);
    return info;
  }

  try {
    const slot0 = await pool.slot0();
    info.slot0 = Array.isArray(slot0) ? slot0.map(formatBig) : formatBig(slot0);
    info.isV3 = true;
  } catch (err) {
    info.slot0Error = String(err);
    info.isV3 = false;
  }

  try {
    const reserveResult = await pool.getReserves();
    info.reserve0 = formatBig(reserveResult[0]);
    info.reserve1 = formatBig(reserveResult[1]);
  } catch (err) {
    info.getReservesError = String(err);
  }

  try {
    const token0Contract = new ethers.Contract(info.token0, ERC20_ABI, provider) as any;
    const token1Contract = new ethers.Contract(info.token1, ERC20_ABI, provider) as any;
    info.decimals0 = Number(await token0Contract.decimals());
    info.decimals1 = Number(await token1Contract.decimals());
  } catch (err) {
    info.decimalsError = String(err);
  }

  if (info.reserve0 !== undefined && info.decimals0 !== undefined) {
    info.normalizedReserve0 = Number(ethers.formatUnits(info.reserve0, info.decimals0));
  }
  if (info.reserve1 !== undefined && info.decimals1 !== undefined) {
    info.normalizedReserve1 = Number(ethers.formatUnits(info.reserve1, info.decimals1));
  }

  return info;
}

async function run() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const mids = [TOKENS.ARB, TOKENS.LINK, TOKENS.UNI, TOKENS.WBTC];

  console.log("Pair audit — Sushi pool type detection for canonical pairs:\n");

  for (const mid of mids) {
    const pairs: Array<{
      label: string;
      tokenA: string;
      tokenB: string;
    }> = [
      { label: `USDC/${mid.symbol}`, tokenA: ADDRESSES.USDC, tokenB: mid.address },
      { label: `${mid.symbol}/WETH`, tokenA: mid.address, tokenB: TOKENS.WETH.address },
    ];

    for (const pair of pairs) {
      console.log(`\n== Auditing ${pair.label} ==`);
      const candidate = await findBestSushiPool(provider, pair.tokenA, pair.tokenB);
      if (!candidate) {
        console.log(`No Sushi V3 pool found for ${pair.label}`);
        continue;
      }

      console.log(`Discovered Sushi V3 pool: ${candidate.poolAddress} (fee ${candidate.feeTier})`);
      const info = await inspectPair(provider, candidate.poolAddress);
      console.log(JSON.stringify(info, null, 2));

      const pairType = info.isV3 ? "V3" : info.reserve0 !== undefined ? "V2" : "unknown";
      console.log(`Detected pair type: ${pairType}`);
    }
  }
}

run().catch((e) => { console.error("pairAudit failed:", e); process.exit(1); });
