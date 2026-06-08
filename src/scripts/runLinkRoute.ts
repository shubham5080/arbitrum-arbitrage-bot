import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { TriangleSimulator } from '../strategies/triangular/triangleSimulator';
import { TOKENS } from '../config/tokens';
import { POOLS } from '../config/pools';
import { findBestUniswapPool } from '../discovery/uniswapPoolDiscovery';
import { ADDRESSES } from '../config/addresses';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const simulator = new TriangleSimulator(provider as any);

async function run() {
  const LINK = TOKENS.LINK.address;
  const WETH = TOKENS.WETH.address;
  const USDC = TOKENS.WETH.address; // NOTE: use USDC as start token in route object below (we'll set startToken per route)

  const bestLinkPool = await findBestUniswapPool(provider, ADDRESSES.USDC, LINK);
  if (!bestLinkPool) {
    throw new Error('Could not discover best Uniswap LINK pool');
  }

  console.log('Selected LINK Uniswap pool:', bestLinkPool.poolAddress);
  console.log('Selected LINK Uniswap fee:', bestLinkPool.feeTier);

  const route = {
    startToken: TOKENS.WETH.address, // placeholder, will use USDC in simulate call
    startTokenDecimals: 6,
    middleToken: LINK,
    middleTokenDecimals: TOKENS.LINK.decimals,
    endToken: WETH,
    endTokenDecimals: TOKENS.WETH.decimals,
  } as any;

  // Sizes requested
  const sizes = [100, 500, 1000, 5000];

  for (const size of sizes) {
    console.log('\n=== Running LINK route for size:', size, 'USDC ===');

    // Simulate USDC -> LINK -> WETH -> USDC
    // build a route object matching TriangleRoute expected shape
    const triangleRoute = {
      startToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
      startTokenDecimals: 6,
      middleToken: LINK,
      middleTokenDecimals: TOKENS.LINK.decimals,
      endToken: WETH,
      endTokenDecimals: TOKENS.WETH.decimals,
    } as any;

    try {
      const res = await simulator.simulateTriangle(
        triangleRoute,
        size,
        'uniswap',
        'sushi',
        'uniswap',
        {
          leg1: bestLinkPool.poolAddress,
          leg2: (POOLS as any).LINK["SUSHI"].address,
          leg3: (POOLS as any).WETH["UNISWAP"].address,
        }
      );

      console.log('Result:', {
        size,
        finalAmount: res.finalAmount,
        grossProfit: res.grossProfit,
        profitPercent: res.profitPercent,
        leg1: res.leg1,
        leg2: res.leg2,
        leg3: res.leg3,
      });
    } catch (err) {
      console.error('Simulation failed for size', size, err);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
