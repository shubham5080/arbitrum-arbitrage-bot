import { ethers } from "ethers";
import { STABLECOINS, getStablecoinByAddress } from "../stablecoin/stablecoinConfig";

export const CURVE_ARBITRUM = {
  META_REGISTRY: "0x13526206545e2DC7CcfBaF28dC88F440ce7AD3e0",
  ADDRESS_PROVIDER: "0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98",
  VIEWS: "0x3BbA971980A721C7A33cEF62cE01c0d744F26e95",
  STABLESWAP_FACTORY: "0x9AF14D26075f142eb3F292D5065EB3faa646167b",
} as const;

const META_REGISTRY_ABI = [
  "function pool_count() view returns (uint256)",
  "function pool_list(uint256) view returns (address)",
  "function get_coins(address) view returns (address[8])",
  "function get_n_coins(address) view returns (uint256)",
  "function get_pool_asset_type(address) view returns (uint256)",
  "function find_pool_for_coins(address,address,uint256) view returns (address)",
  "function get_lp_token(address) view returns (address)",
];

const POOL_ABI = [
  "function coins(uint256) view returns (address)",
  "function balances(uint256) view returns (uint256)",
  "function get_dy(int128,int128,uint256) view returns (uint256)",
  "function get_dy(uint256,uint256,uint256) view returns (uint256)",
];

const ERC20_ABI = ["function decimals() view returns (uint8)"];

const ASSET_TYPE_LABELS: Record<number, string> = {
  0: "USD",
  1: "ETH",
  2: "BTC",
  3: "Other",
  4: "Crypto",
};

const STABLE_ADDRESSES = new Set(
  Object.values(STABLECOINS).map((c) => c.address.toLowerCase())
);

export interface CurvePoolInfo {
  address: string;
  assetType: number;
  assetTypeLabel: string;
  nCoins: number;
  coins: string[];
  coinSymbols: string[];
  balances: string[];
  tvlEstimateUsd: number;
  containsMonitoredStables: boolean;
  swapAccessible: boolean;
}

export interface CurveInventoryReport {
  generatedAt: string;
  totalPools: number;
  stablePools: CurvePoolInfo[];
  usdPools: CurvePoolInfo[];
  monitoredStablePools: CurvePoolInfo[];
  pairPoolMap: Record<string, string | null>;
}

async function getTokenDecimals(
  provider: ethers.Provider,
  address: string
): Promise<number> {
  try {
    const token = new ethers.Contract(address, ERC20_ABI, provider) as any;
    return Number(await token.decimals());
  } catch {
    return 18;
  }
}

async function poolHasLiquidity(
  provider: ethers.Provider,
  poolAddress: string,
  nCoins: number
): Promise<boolean> {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  let total = 0n;
  for (let i = 0; i < nCoins; i++) {
    try {
      total += await pool.balances(i);
    } catch {
      return false;
    }
  }
  return total > 0n;
}

async function readPoolInfo(
  provider: ethers.Provider,
  poolAddress: string,
  assetType: number
): Promise<CurvePoolInfo | null> {
  const registry = new ethers.Contract(
    CURVE_ARBITRUM.META_REGISTRY,
    META_REGISTRY_ABI,
    provider
  ) as any;

  let nCoins: number;
  let coins: string[];
  try {
    nCoins = Number(await registry.get_n_coins(poolAddress));
    const rawCoins: string[] = await registry.get_coins(poolAddress);
    coins = rawCoins.slice(0, nCoins).filter((c) => c !== ethers.ZeroAddress);
  } catch {
    return null;
  }

  if (coins.length === 0) return null;
  if (!(await poolHasLiquidity(provider, poolAddress, nCoins))) return null;

  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  const balances: string[] = [];
  let tvlEstimateUsd = 0;

  for (let i = 0; i < coins.length; i++) {
    try {
      const bal = await pool.balances(i);
      const decimals = await getTokenDecimals(provider, coins[i]!);
      const human = Number(ethers.formatUnits(bal, decimals));
      balances.push(human.toFixed(2));
      const stable = getStablecoinByAddress(coins[i]!);
      if (stable) {
        tvlEstimateUsd += human * stable.pegTarget;
      }
    } catch {
      balances.push("0");
    }
  }

  if (tvlEstimateUsd < 1000) {
    return null;
  }

  const coinSymbols = coins.map((c) => getStablecoinByAddress(c)?.symbol ?? c.slice(0, 8));
  const containsMonitoredStables = coins.some((c) => STABLE_ADDRESSES.has(c.toLowerCase()));

  let swapAccessible = false;
  if (coins.length >= 2 && tvlEstimateUsd >= 1000) {
    const stableIndices = coins
      .map((c, idx) => (getStablecoinByAddress(c) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (stableIndices.length >= 2) {
      const i = stableIndices[0]!;
      const j = stableIndices[1]!;
      try {
        const decI = await getTokenDecimals(provider, coins[i]!);
        const decJ = await getTokenDecimals(provider, coins[j]!);
        const dx = ethers.parseUnits("1000", decI);
        for (const sig of ["get_dy(int128,int128,uint256)", "get_dy(uint256,uint256,uint256)"] as const) {
          try {
            const dy = await pool[sig](i, j, dx);
            const rate = Number(ethers.formatUnits(dy, decJ)) / 1000;
            swapAccessible = rate > 0 && Math.abs(rate - 1) < 0.05;
            if (swapAccessible) break;
          } catch {
            continue;
          }
        }
      } catch {
        swapAccessible = false;
      }
    }
  }

  return {
    address: poolAddress,
    assetType,
    assetTypeLabel: ASSET_TYPE_LABELS[assetType] ?? `type-${assetType}`,
    nCoins: coins.length,
    coins,
    coinSymbols,
    balances,
    tvlEstimateUsd: Math.round(tvlEstimateUsd),
    containsMonitoredStables,
    swapAccessible,
  };
}

export async function discoverCurvePools(
  provider: ethers.Provider,
  options?: { maxPools?: number }
): Promise<CurvePoolInfo[]> {
  const registry = new ethers.Contract(
    CURVE_ARBITRUM.META_REGISTRY,
    META_REGISTRY_ABI,
    provider
  ) as any;

  const seen = new Set<string>();
  const pools: CurvePoolInfo[] = [];

  // Fast path: discover pools via stablecoin pair lookup
  const stableAddresses = Object.values(STABLECOINS).map((c) => c.address);
  for (let i = 0; i < stableAddresses.length; i++) {
    for (let j = i + 1; j < stableAddresses.length; j++) {
      try {
        const addr = await registry.find_pool_for_coins(stableAddresses[i], stableAddresses[j], 0);
        if (addr && addr !== ethers.ZeroAddress) seen.add(addr.toLowerCase());
      } catch {
        /* no pool */
      }
    }
  }

  // Fallback: scan registry for USD pools (asset type 0) up to maxPools
  const maxPools = options?.maxPools ?? 30;
  if (seen.size < maxPools) {
    const count = Number(await registry.pool_count());
    for (let i = 0; i < count && seen.size < maxPools; i++) {
      const poolAddress: string = await registry.pool_list(i);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) continue;
      try {
        const assetType = Number(await registry.get_pool_asset_type(poolAddress));
        if (assetType === 0) seen.add(poolAddress.toLowerCase());
      } catch {
        continue;
      }
    }
  }

  for (const addr of seen) {
    let assetType = 0;
    try {
      assetType = Number(await registry.get_pool_asset_type(addr));
    } catch {
      /* default */
    }
    const info = await readPoolInfo(provider, addr, assetType);
    if (info) pools.push(info);
  }

  return pools;
}

export async function findCurvePoolForPair(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string
): Promise<string | null> {
  const registry = new ethers.Contract(
    CURVE_ARBITRUM.META_REGISTRY,
    META_REGISTRY_ABI,
    provider
  ) as any;

  for (let i = 0; i < 10; i++) {
    try {
      const pool = await registry.find_pool_for_coins(tokenA, tokenB, i);
      if (!pool || pool === ethers.ZeroAddress) break;

      const nCoins = Number(await registry.get_n_coins(pool));
      if (!(await poolHasLiquidity(provider, pool, nCoins))) continue;

      const rawCoins: string[] = await registry.get_coins(pool);
      const coins = rawCoins.slice(0, nCoins).map((c) => c.toLowerCase());
      if (
        coins.includes(tokenA.toLowerCase()) &&
        coins.includes(tokenB.toLowerCase())
      ) {
        return pool;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolvePoolCoins(
  provider: ethers.Provider,
  poolAddress: string
): Promise<string[]> {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  const coins: string[] = [];
  for (let i = 0; i < 8; i++) {
    try {
      const coin = await pool.coins(i);
      if (!coin || coin === ethers.ZeroAddress) break;
      coins.push(coin.toLowerCase());
    } catch {
      break;
    }
  }
  if (coins.length >= 2) return coins;

  const registry = new ethers.Contract(
    CURVE_ARBITRUM.META_REGISTRY,
    META_REGISTRY_ABI,
    provider
  ) as any;
  const n = Number(await registry.get_n_coins(poolAddress));
  const raw: string[] = await registry.get_coins(poolAddress);
  return raw.slice(0, n).map((c) => c.toLowerCase());
}

export async function quoteCurveSwap(
  provider: ethers.Provider,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number
): Promise<bigint | null> {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  const coins = await resolvePoolCoins(provider, poolAddress);

  const i = coins.indexOf(tokenIn.toLowerCase());
  const j = coins.indexOf(tokenOut.toLowerCase());
  if (i < 0 || j < 0) return null;

  const dx = ethers.parseUnits(amountIn, tokenInDecimals);
  for (const sig of ["get_dy(int128,int128,uint256)", "get_dy(uint256,uint256,uint256)"] as const) {
    try {
      return await pool[sig](i, j, dx);
    } catch {
      continue;
    }
  }
  return null;
}

export async function generateCurveInventoryReport(
  provider: ethers.Provider
): Promise<CurveInventoryReport> {
  const allPools = await discoverCurvePools(provider);
  const usdPools = allPools.filter((p) => p.assetType === 0);
  const stablePools = allPools.filter((p) => p.containsMonitoredStables);
  const monitoredStablePools = stablePools.filter((p) => p.swapAccessible);

  const pairs: { label: string; base: keyof typeof STABLECOINS; quote: keyof typeof STABLECOINS }[] = [
    { label: "USDC/USDT", base: "USDC", quote: "USDT" },
    { label: "USDC/DAI", base: "USDC", quote: "DAI" },
    { label: "USDT/DAI", base: "USDT", quote: "DAI" },
    { label: "USDC/USDC.e", base: "USDC", quote: "USDC_E" },
    { label: "USDC/FRAX", base: "USDC", quote: "FRAX" },
  ];

  const pairPoolMap: Record<string, string | null> = {};
  for (const { label, base, quote } of pairs) {
    const tokenA = STABLECOINS[base].address;
    const tokenB = STABLECOINS[quote].address;
    pairPoolMap[label] = await findCurvePoolForPair(provider, tokenA, tokenB);
  }

  return {
    generatedAt: new Date().toISOString(),
    totalPools: allPools.length,
    stablePools,
    usdPools,
    monitoredStablePools,
    pairPoolMap,
  };
}

export function formatCurveInventoryMarkdown(report: CurveInventoryReport): string {
  const lines: string[] = [
    "## Curve Pools",
    "",
    `**Generated:** ${report.generatedAt}`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total pools | ${report.totalPools} |`,
    `| USD asset pools | ${report.usdPools.length} |`,
    `| Monitored stable pools | ${report.monitoredStablePools.length} |`,
    "",
    "### Monitored Stablecoin Pools",
    "",
    "| Pool | Coins | TVL (est USD) | Swap Accessible |",
    "|------|-------|---------------|-----------------|",
  ];

  for (const p of report.monitoredStablePools.sort((a, b) => b.tvlEstimateUsd - a.tvlEstimateUsd)) {
    lines.push(
      `| \`${p.address.slice(0, 10)}...\` | ${p.coinSymbols.join(", ")} | $${p.tvlEstimateUsd.toLocaleString()} | ${p.swapAccessible ? "✅" : "❌"} |`
    );
  }

  lines.push("", "### Pair → Curve Pool Mapping", "", "| Pair | Pool |", "|------|------|");
  for (const [pair, pool] of Object.entries(report.pairPoolMap)) {
    lines.push(`| ${pair} | ${pool ? `\`${pool}\`` : "—"} |`);
  }

  return lines.join("\n");
}
