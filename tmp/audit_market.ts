import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { POOLS } from '../src/config/pools';
import { TOKENS } from '../src/config/tokens';
import { getUniswapBuyQuote, getSushiSellQuote } from '../src/quotes/quoteEngine';

dotenv.config();
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const LINK = TOKENS.LINK;
const LINK_POOL_USI = (POOLS.LINK.UNISWAP as any).address;
const LINK_POOL_SUSHI = (POOLS.LINK.SUSHI as any).address;
const ERC20 = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function name() view returns (string)'];
const POOL = ['function token0() view returns (address)', 'function token1() view returns (address)', 'function slot0() view returns (uint160,uint24,int16,uint16,uint16,uint8,bool)'];

async function main() {
  const uniswapPool = new ethers.Contract(LINK_POOL_USI, POOL, provider) as any;
  const sushiPool = new ethers.Contract(LINK_POOL_SUSHI, POOL, provider) as any;
  const [u0, u1] = await Promise.all([uniswapPool.token0(), uniswapPool.token1()]);
  const [s0, s1] = await Promise.all([sushiPool.token0(), sushiPool.token1()]);
  console.log('LINK Uniswap pool:', LINK_POOL_USI);
  console.log(' token0:', u0);
  console.log(' token1:', u1);
  console.log('LINK Sushi pool:', LINK_POOL_SUSHI);
  console.log(' token0:', s0);
  console.log(' token1:', s1);

  const t0u = new ethers.Contract(u0, ERC20, provider) as any;
  const t1u = new ethers.Contract(u1, ERC20, provider) as any;
  const t0s = new ethers.Contract(s0, ERC20, provider) as any;
  const t1s = new ethers.Contract(s1, ERC20, provider) as any;
  const [u0sym, u1sym, s0sym, s1sym] = await Promise.all([
    t0u.symbol(),
    t1u.symbol(),
    t0s.symbol(),
    t1s.symbol(),
  ]);
  console.log('Uniswap pool symbols:', u0sym, u1sym);
  console.log('Sushi pool symbols:', s0sym, s1sym);

  const amountInUsdc = '250';
  const linkOut = await getUniswapBuyQuote(provider, LINK.address, LINK.decimals, amountInUsdc);
  const linkOutNum = Number(ethers.formatUnits(linkOut, LINK.decimals));
  const effectivePriceUni = Number(amountInUsdc) / linkOutNum;
  console.log('Uniswap buy leg:');
  console.log(' tokenIn: USDC');
  console.log(' tokenOut: LINK');
  console.log(' pool:', LINK_POOL_USI);
  console.log(' feeTier: 500');
  console.log(' amountIn:', amountInUsdc, 'USDC');
  console.log(' amountOut:', linkOutNum, 'LINK');
  console.log(' effectivePrice:', effectivePriceUni, 'USDC per LINK');

  const usdcOut = await getSushiSellQuote(
    provider,
    LINK.address,
    LINK.decimals,
    ethers.formatUnits(linkOut, LINK.decimals),
    LINK_POOL_SUSHI
  );
  const usdcOutNum = Number(ethers.formatUnits(usdcOut, 6));
  const effectivePriceSushi = usdcOutNum / linkOutNum;
  console.log('Sushi sell leg:');
  console.log(' tokenIn: LINK');
  console.log(' tokenOut: USDC');
  console.log(' pool:', LINK_POOL_SUSHI);
  console.log(' feeTier: 3000');
  console.log(' amountIn:', linkOutNum, 'LINK');
  console.log(' amountOut:', usdcOutNum, 'USDC');
  console.log(' effectivePrice:', effectivePriceSushi, 'USDC per LINK');
  console.log('raw profit:', usdcOutNum - Number(amountInUsdc));
}
main().catch((e)=>{ console.error(e); process.exit(1); });
