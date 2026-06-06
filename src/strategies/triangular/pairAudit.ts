import { ethers } from "ethers";
import { TOKENS } from "../../config/tokens";
import { ADDRESSES } from "../../config/addresses";
import { findBestSushiPool } from "../../discovery/sushiPoolDiscovery";

const RPC_URL = "https://arb1.arbitrum.io/rpc";

async function inspectPool(provider: ethers.Provider, poolAddress: string) {
  const info: any = { poolAddress };

  try {
    const pool = new ethers.Contract(poolAddress, [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      // UniswapV3 style
      "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
      "function liquidity() view returns (uint128)",
      // UniswapV2 style
      "function getReserves() view returns (uint112,uint112,uint32)",
    ], provider) as any;

    try { info.token0 = await pool.token0(); } catch (e) { info.token0_error = String(e); }
    try { info.token1 = await pool.token1(); } catch (e) { info.token1_error = String(e); }

    try { info.slot0 = await pool.slot0(); } catch (e) { info.slot0_error = String(e); }
    try { info.liquidity = await pool.liquidity(); } catch (e) { info.liquidity_error = String(e); }

    try {
      const reserves = await pool.getReserves();
      info.reserve0 = reserves[0];
      info.reserve1 = reserves[1];
    } catch (e) {
      info.getReserves_error = String(e);
      // fallback to ERC20 balances
      try {
        const ERC20 = [
          "function balanceOf(address) view returns (uint256)",
          "function decimals() view returns (uint8)",
        ];
        if (info.token0 && info.token1) {
          const t0 = new ethers.Contract(info.token0, ERC20, provider) as any;
          const t1 = new ethers.Contract(info.token1, ERC20, provider) as any;
          const [b0, b1] = await Promise.all([t0.balanceOf(poolAddress), t1.balanceOf(poolAddress)]);
          info.reserve0 = b0;
          info.reserve1 = b1;
        }
      } catch (be) {
        info.balanceOf_error = String(be);
      }
    }

    // decimals for tokens
    try {
      const ERC20meta = ["function decimals() view returns (uint8)"];
      if (info.token0) {
        const t0 = new ethers.Contract(info.token0, ERC20meta, provider) as any;
        info.decimals0 = Number(await t0.decimals());
      }
      if (info.token1) {
        const t1 = new ethers.Contract(info.token1, ERC20meta, provider) as any;
        info.decimals1 = Number(await t1.decimals());
      }
    } catch (e) {
      info.decimals_error = String(e);
    }

    // normalized reserves
    try {
      if (info.reserve0 !== undefined && info.decimals0 !== undefined) {
        info.normalizedReserve0 = Number(ethers.formatUnits(info.reserve0, info.decimals0));
      }
      if (info.reserve1 !== undefined && info.decimals1 !== undefined) {
        info.normalizedReserve1 = Number(ethers.formatUnits(info.reserve1, info.decimals1));
      }
    } catch (e) {
      info.normalize_error = String(e);
    }

    // if slot0 present, compute sqrtPriceX96 -> human price
    try {
      if (info.slot0 && info.token0 && info.token1) {
        const sqrtPriceX96 = BigInt(info.slot0[0].toString());
        const Q96 = 2n ** 96n;
        const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
        const price = sqrtPrice * sqrtPrice; // token1 per token0 (?) we'll report both orientations

        info.sqrtPrice = Number(price);
        // adjust for decimals
        const d0 = info.decimals0 ?? 18;
        const d1 = info.decimals1 ?? 18;
        const decimalAdjustment = 10 ** (d0 - d1);
        info.sqrtPrice_human = price * decimalAdjustment;
      }
    } catch (e) {
      info.sqrt_error = String(e);
    }

    return info;
  } catch (err) {
    return { poolAddress, error: String(err) };
  }
}

async function run() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // target token pairs to audit (USDC <> token, token <> WETH)
  const mids = [TOKENS.ARB, TOKENS.LINK, TOKENS.UNI, TOKENS.WBTC];

  const pairs: Array<[string, string, string]> = [];
  for (const mid of mids) {
    pairs.push([ADDRESSES.USDC, mid.address, `${ADDRESSES.USDC}/${mid.symbol}`]);
    pairs.push([mid.address, TOKENS.WETH.address, `${mid.symbol}/${TOKENS.WETH.symbol}`]);
  }

  console.log("Pair audit — checking Sushi pools for canonical pairs:\n");

  for (const [a, b, label] of pairs) {
    try {
      const pool = await findBestSushiPool(provider, a, b);
      if (!pool) {
        console.log(`No Sushi v3 pool found for ${label}`);
        continue;
      }

      console.log(`\n== Pair: ${label}  pool: ${pool.address}  fee:${pool.fee}  dex:${pool.dex}`);
      const info = await inspectPool(provider, pool.address);
      const jsonSafe = JSON.stringify(info, (_k, v) => {
        if (typeof v === 'bigint') return v.toString();
        return v;
      }, 2);
      console.log(jsonSafe);
    } catch (e) {
      console.log(`Error auditing ${label}:`, String(e));
    }
  }
}

run().catch((e) => { console.error('pairAudit failed:', e); process.exit(1); });
