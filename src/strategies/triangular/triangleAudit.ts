import { ethers } from "ethers";
import { TOKENS } from "../../config/tokens";
import { ADDRESSES } from "../../config/addresses";
import { findBestSushiPool } from "../../discovery/sushiPoolDiscovery";
import { findBestCamelotPool } from "../../discovery/camelotPoolDiscovery";
import {
  getUniswapBuyQuote,
  getUniswapSellQuote,
  getSushiBuyQuote,
  getSushiSellQuote,
  getSushiQuote,
} from "../../quotes/quoteEngine";

const RPC_URL = "https://arb1.arbitrum.io/rpc";

async function inspectPool(provider: ethers.Provider, poolAddress: string) {
  try {
    const pool = new ethers.Contract(poolAddress, [
      "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function liquidity() view returns (uint128)",
    ], provider) as any;

    const token0 = await pool.token0();
    const token1 = await pool.token1();
    let slot0: any = null;
    try { slot0 = await pool.slot0(); } catch (e) { /* ignore */ }
    let liquidity: any = null;
    try { liquidity = await pool.liquidity(); } catch (e) { /* ignore */ }

    return { poolAddress, token0, token1, slot0, liquidity };
  } catch (err) {
    return { poolAddress, error: String(err) };
  }
}

async function audit() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // find pools
  const sushiPoolARB_WETH = await findBestSushiPool(provider, TOKENS.ARB.address, TOKENS.WETH.address);
  const sushiPoolUSDC_ARB = await findBestSushiPool(provider, TOKENS.ARB.address, ADDRESSES.USDC);
  const camelotPoolWETH_USDC = await findBestCamelotPool(provider, TOKENS.WETH.address, ADDRESSES.USDC);

  const sizes = [100, 1000, 5000];

  console.log("\nTriangle Audit — route: USDC -> ARB -> WETH -> USDC");

  for (const size of sizes) {
    console.log(`\n=== Audit for initial USDC: ${size} ===`);

    // Leg 1: USDC -> ARB
    console.log('\n-- Leg 1: USDC -> ARB');
    console.log('DEX: Uniswap (Quoter)');
    try {
      const uniOut = await getUniswapBuyQuote(provider, TOKENS.ARB.address, TOKENS.ARB.decimals, String(size));
      console.log({ dex: 'uniswap', tokenIn: 'USDC', tokenOut: 'ARB', amountIn: size, amountOut: Number(ethers.formatUnits(uniOut, TOKENS.ARB.decimals)), quoteSource: 'quoter' });
    } catch (err) { console.warn('Uniswap quote failed:', err); }

    if (sushiPoolUSDC_ARB?.poolAddress) {
      console.log('DEX: Sushi (pool spot price)');
      const poolInfo = await inspectPool(provider, sushiPoolUSDC_ARB.poolAddress);
      console.log('Pool info:', poolInfo);
      try {
        const sushiOut = await getSushiBuyQuote(provider, TOKENS.ARB.address, TOKENS.ARB.decimals, String(size), sushiPoolUSDC_ARB);
        console.log({ dex: 'sushi', tokenIn: 'USDC', tokenOut: 'ARB', amountIn: size, amountOut: Number(ethers.formatUnits(sushiOut, TOKENS.ARB.decimals)), quoteSource: 'spot(pool slot0)'});
      } catch (err) { console.warn('Sushi quote failed:', err); }
    } else {
      console.warn('No Sushi pool found for USDC/ARB');
    }

    // Leg 2: ARB -> WETH
    console.log('\n-- Leg 2: ARB -> WETH');
    if (sushiPoolARB_WETH?.poolAddress) {
      console.log('DEX: Sushi (pool spot price)');
      const poolInfo = await inspectPool(provider, sushiPoolARB_WETH.poolAddress);
      console.log('Pool info:', poolInfo);
      try {
        const slot0 = poolInfo.slot0;
        if (slot0) {
          const sqrtPriceX96 = BigInt(slot0[0].toString());
          const Q96 = 2n ** 96n;
          const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
          const price = sqrtPrice * sqrtPrice;

          const token0 = poolInfo.token0.toLowerCase();
          const token1 = poolInfo.token1.toLowerCase();
          const token0Decimals = token0 === ADDRESSES.USDC.toLowerCase() ? 6 : token0 === TOKENS.ARB.address.toLowerCase() ? TOKENS.ARB.decimals : token0 === TOKENS.WETH.address.toLowerCase() ? TOKENS.WETH.decimals : 18;
          const token1Decimals = token1 === ADDRESSES.USDC.toLowerCase() ? 6 : token1 === TOKENS.ARB.address.toLowerCase() ? TOKENS.ARB.decimals : token1 === TOKENS.WETH.address.toLowerCase() ? TOKENS.WETH.decimals : 18;

          const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
          const humanPrice = price * decimalAdjustment;

          let finalPrice = humanPrice;
          if (token1 === TOKENS.ARB.address.toLowerCase() && token0 === TOKENS.WETH.address.toLowerCase()) {
            finalPrice = 1 / humanPrice;
          }

          console.log({ dex: 'sushi', tokenIn: 'ARB', tokenOut: 'WETH', amountIn: size, pricePerUnit: finalPrice, amountOut_estimated: Number(size * finalPrice), quoteSource: 'spot(pool slot0)' });
        } else {
          console.warn('No slot0 available for pool to compute price');
        }
      } catch (err) { console.warn('Pool price failed:', err); }
    } else {
      console.warn('No Sushi pool found for ARB/WETH');
    }

    // Leg 3: WETH -> USDC
    console.log('\n-- Leg 3: WETH -> USDC');
    console.log('DEX: Uniswap (Quoter)');
    try {
      const usdcOut = await getUniswapSellQuote(provider, TOKENS.WETH.address, TOKENS.WETH.decimals, '1.0');
      console.log({ dex: 'uniswap', tokenIn: 'WETH', tokenOut: 'USDC', amountIn: 1, amountOut: Number(ethers.formatUnits(usdcOut, 6)), quoteSource: 'quoter' });
    } catch (err) { console.warn('Uniswap sell quote failed:', err); }

    // Gas model check
    try {
      const feeData = await provider.getFeeData();
      console.log('Fee data sample:', feeData);
    } catch (err) {
      console.warn('Fee data failed:', err);
    }
  }
}

audit().catch((e) => { console.error('Audit failed:', e); process.exit(1); });
