import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";
import { findBestSushiPool } from "../discovery/sushiPoolDiscovery";
import { getSushiV3Quote } from "./sushiV3Quote";
export { getCamelotBuyQuote, getCamelotSellQuote } from "./camelotQuote";

const UNISWAP_QUOTER =
  "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

const USDC = ADDRESSES.USDC;

const UNISWAP_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)"
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

async function getPoolPrice(
  provider: ethers.Provider,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  tokenInDecimals: number,
  tokenOutDecimals: number
) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  const [token0, token1, slot0] = await Promise.all([
    pool.token0(),
    pool.token1(),
    pool.slot0(),
  ]);

  const sqrtPriceX96 = BigInt(slot0[0].toString());
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;

  const token0Decimals = token0.toLowerCase() === USDC.toLowerCase()
    ? 6
    : token0.toLowerCase() === tokenIn.toLowerCase()
    ? tokenInDecimals
    : token0.toLowerCase() === tokenOut.toLowerCase()
    ? tokenOutDecimals
    : 18;
  const token1Decimals = token1.toLowerCase() === USDC.toLowerCase()
    ? 6
    : token1.toLowerCase() === tokenIn.toLowerCase()
    ? tokenInDecimals
    : token1.toLowerCase() === tokenOut.toLowerCase()
    ? tokenOutDecimals
    : 18;

  const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
  const humanPrice = price * decimalAdjustment;

  if (token0.toLowerCase() === tokenIn.toLowerCase() && token1.toLowerCase() === tokenOut.toLowerCase()) {
    return humanPrice;
  }

  if (token1.toLowerCase() === tokenIn.toLowerCase() && token0.toLowerCase() === tokenOut.toLowerCase()) {
    return 1 / humanPrice;
  }

  throw new Error(
    `Pool ${poolAddress} does not match token ${tokenIn} / ${tokenOut} order.`
  );
}

export async function getUniswapBuyQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  fee = 500
) {
  const iface = new ethers.Interface(UNISWAP_ABI);

  const amountInUnits = ethers.parseUnits(amountIn, 6);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: USDC,
    tokenOut: tokenAddress,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][Uniswap][BUY] params:", {
    tokenIn: USDC,
    tokenOut: tokenAddress,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData: callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: UNISWAP_QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][Uniswap][BUY] provider.call failed", {
      tokenIn: USDC,
      tokenOut: tokenAddress,
      amountIn,
      amountInUnits: amountInUnits.toString(),
      fee,
      callData,
      err: err && err.message ? err.message : err,
    });
    throw err;
  }

  console.debug("[QUOTER][Uniswap][BUY] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);

  console.debug("[QUOTER][Uniswap][BUY] decoded amountOut:", decoded[0].toString());

  return decoded[0] as bigint;
}

export async function getUniswapSellQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  fee = 500
) {
  const iface = new ethers.Interface(UNISWAP_ABI);

  const amountInUnits = ethers.parseUnits(amountIn, tokenDecimals);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: tokenAddress,
    tokenOut: USDC,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][Uniswap][SELL] params:", {
    tokenIn: tokenAddress,
    tokenOut: USDC,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData: callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: UNISWAP_QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][Uniswap][SELL] provider.call failed", {
      tokenIn: tokenAddress,
      tokenOut: USDC,
      amountIn,
      amountInUnits: amountInUnits.toString(),
      fee,
      callData,
      err: err && err.message ? err.message : err,
    });
    throw err;
  }

  console.debug("[QUOTER][Uniswap][SELL] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);

  console.debug("[QUOTER][Uniswap][SELL] decoded amountOut:", decoded[0].toString());

  return decoded[0] as bigint;
}

export async function getSushiBuyQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  poolAddress: string
) {
  if (!poolAddress) throw new Error("Sushi buy quote requires poolAddress");
  const pair = new ethers.Contract(poolAddress, UNISWAP_V2_PAIR_ABI, provider) as any;
  const [token0, token1] = await Promise.all([pair.token0(), pair.token1()]);
  let reserves: any;

  // detect V3 by checking factory lookup for known fee tiers — if the discovered pool matches this address, treat as V3
  const candidateForV3 = await findBestSushiPool(provider, ADDRESSES.USDC, tokenAddress);
  if (candidateForV3 && candidateForV3.address.toLowerCase() === poolAddress.toLowerCase()) {
    const fee = candidateForV3.fee ?? 3000;
    console.debug("[SUSHI][BUY] detected V3 candidate", { candidateForV3 });
    const out = await getSushiV3Quote(provider, ADDRESSES.USDC, tokenAddress, amountIn, 6, fee);
    return out;
  }

  try {
    reserves = await pair.getReserves();
  } catch (err) {
    // Fallback: read token balances directly from ERC20 contracts
    const ERC20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    const t0 = new ethers.Contract(token0, ERC20, provider) as any;
    const t1 = new ethers.Contract(token1, ERC20, provider) as any;
    const [b0, b1] = await Promise.all([t0.balanceOf(poolAddress), t1.balanceOf(poolAddress)]);
    reserves = { reserve0: b0, reserve1: b1 };
  }

  const amountInUnits = ethers.parseUnits(amountIn, 6);

  // Determine reserveIn/reserveOut order
  const token0lc = token0.toLowerCase();
  const token1lc = token1.toLowerCase();
  const tokenInAddress = ADDRESSES.USDC.toLowerCase();
  const tokenOutAddress = tokenAddress.toLowerCase();

  let reserveIn: bigint;
  let reserveOut: bigint;
  if (token0lc === tokenInAddress && token1lc === tokenOutAddress) {
    reserveIn = BigInt(reserves.reserve0.toString());
    reserveOut = BigInt(reserves.reserve1.toString());
  } else if (token1lc === tokenInAddress && token0lc === tokenOutAddress) {
    reserveIn = BigInt(reserves.reserve1.toString());
    reserveOut = BigInt(reserves.reserve0.toString());
  } else {
    throw new Error(`Pool ${poolAddress} reserves do not match USDC/${tokenAddress}`);
  }

  // apply UniswapV2 formula
  const amountInWithFee = amountInUnits * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOut = numerator / denominator;

  return amountOut;
}

export async function getSushiSellQuote(
  provider: ethers.Provider,
  tokenAddress: string,
  tokenDecimals: number,
  amountIn: string,
  poolAddress: string
) {
  if (!poolAddress) throw new Error("Sushi sell quote requires poolAddress");
  const pair = new ethers.Contract(poolAddress, UNISWAP_V2_PAIR_ABI, provider) as any;
  const [token0, token1] = await Promise.all([pair.token0(), pair.token1()]);
  let reserves: any;

  const candidateForV3Sell = await findBestSushiPool(provider, tokenAddress, ADDRESSES.USDC);
  if (candidateForV3Sell && candidateForV3Sell.address.toLowerCase() === poolAddress.toLowerCase()) {
    const fee = candidateForV3Sell.fee ?? 3000;
    console.debug("[SUSHI][SELL] detected V3 candidate", { candidateForV3Sell });
    const out = await getSushiV3Quote(provider, tokenAddress, ADDRESSES.USDC, amountIn, tokenDecimals, fee);
    return out;
  }

  try {
    reserves = await pair.getReserves();
  } catch (err) {
    const ERC20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    const t0 = new ethers.Contract(token0, ERC20, provider) as any;
    const t1 = new ethers.Contract(token1, ERC20, provider) as any;
    const [b0, b1] = await Promise.all([t0.balanceOf(poolAddress), t1.balanceOf(poolAddress)]);
    reserves = { reserve0: b0, reserve1: b1 };
  }

  const amountInUnits = ethers.parseUnits(amountIn, tokenDecimals);

  const token0lc = token0.toLowerCase();
  const token1lc = token1.toLowerCase();
  const tokenInAddress = tokenAddress.toLowerCase();
  const tokenOutAddress = ADDRESSES.USDC.toLowerCase();

  let reserveIn: bigint;
  let reserveOut: bigint;
  if (token0lc === tokenInAddress && token1lc === tokenOutAddress) {
    reserveIn = BigInt(reserves.reserve0.toString());
    reserveOut = BigInt(reserves.reserve1.toString());
  } else if (token1lc === tokenInAddress && token0lc === tokenOutAddress) {
    reserveIn = BigInt(reserves.reserve1.toString());
    reserveOut = BigInt(reserves.reserve0.toString());
  } else {
    throw new Error(`Pool ${poolAddress} reserves do not match ${tokenAddress}/USDC`);
  }

  const amountInWithFee = amountInUnits * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOut = numerator / denominator;

  return amountOut;
}

export async function getSushiQuote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  amountIn: string,
  poolAddress: string
) {
  if (!poolAddress) throw new Error("Sushi quote requires poolAddress");
  // Probe the supplied poolAddress to see if it implements V3's slot0 (i.e., is actually a V3 pool)
  const v3Probe = new ethers.Contract(poolAddress, POOL_ABI, provider) as any;
  try {
    const slot0 = await v3Probe.slot0();
    // It's a V3-like pool. Determine fee via factory lookup if possible.
    const candidate = await findBestSushiPool(provider, tokenIn, tokenOut);
    const fee = candidate && candidate.address.toLowerCase() === poolAddress.toLowerCase() ? candidate.fee ?? 3000 : candidate?.fee ?? 3000;
    console.debug("[SUSHI][QUOTE] detected provided poolAddress is V3; routing to V3 quoter", { poolAddress, fee, candidate });
    return await getSushiV3Quote(provider, tokenIn, tokenOut, amountIn, tokenInDecimals, fee);
  } catch (e) {
    // Not a V3 pool or probe failed; fall back to V2 logic below
  }

  const pair = new ethers.Contract(poolAddress, UNISWAP_V2_PAIR_ABI, provider) as any;
  const [token0, token1] = await Promise.all([pair.token0(), pair.token1()]);
  let reserves: any;
  // Detect V3 pool and route to V3 quoter when applicable
  try {
    const candidateForV3Generic = await findBestSushiPool(provider, tokenIn, tokenOut);
    console.debug("[SUSHI][QUOTE] candidateForV3Generic:", { candidateForV3Generic, poolAddress });
    if (candidateForV3Generic && candidateForV3Generic.address.toLowerCase() === poolAddress.toLowerCase()) {
      const fee = candidateForV3Generic.fee ?? 3000;
      console.debug("[SUSHI][QUOTE] detected V3 candidate", { candidateForV3Generic });
      return await getSushiV3Quote(provider, tokenIn, tokenOut, amountIn, tokenInDecimals, fee);
    }
  } catch (err) {
    // If detection fails, continue to attempt V2 read as fallback
    console.debug("[SUSHI][QUOTE] V3 detection failed, falling back to V2 logic", { err: String(err) });
  }
  try {
    reserves = await pair.getReserves();
  } catch (err) {
    const ERC20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    const t0 = new ethers.Contract(token0, ERC20, provider) as any;
    const t1 = new ethers.Contract(token1, ERC20, provider) as any;
    const [b0, b1] = await Promise.all([t0.balanceOf(poolAddress), t1.balanceOf(poolAddress)]);
    reserves = { reserve0: b0, reserve1: b1 };
  }

  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);

  const token0lc = token0.toLowerCase();
  const token1lc = token1.toLowerCase();
  const tokenInAddress = tokenIn.toLowerCase();
  const tokenOutAddress = tokenOut.toLowerCase();

  let reserveIn: bigint;
  let reserveOut: bigint;
  if (token0lc === tokenInAddress && token1lc === tokenOutAddress) {
    reserveIn = BigInt(reserves.reserve0.toString());
    reserveOut = BigInt(reserves.reserve1.toString());
  } else if (token1lc === tokenInAddress && token0lc === tokenOutAddress) {
    reserveIn = BigInt(reserves.reserve1.toString());
    reserveOut = BigInt(reserves.reserve0.toString());
  } else {
    throw new Error(`Pool ${poolAddress} reserves do not match ${tokenIn}/${tokenOut}`);
  }

  // Reject low-liquidity pools prior to quoting
  try {
    const { RISK } = await import("../config/risk");
    if (reserveIn < RISK.MIN_POOL_LIQUIDITY || reserveOut < RISK.MIN_POOL_LIQUIDITY) {
      const { logRejectedRoute } = await import("../utils/rejectionLogger");
      logRejectedRoute({ tokenPath: [tokenIn, tokenOut], poolAddress, liquidity: (reserveIn < reserveOut ? reserveIn : reserveOut), reason: "liquidity_below_MIN_POOL_LIQUIDITY" });
      throw new Error("Pool liquidity below MIN_POOL_LIQUIDITY");
    }
  } catch (err) {
    // continue to throw downstream
  }

  const amountInWithFee = amountInUnits * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOut = numerator / denominator;

  return amountOut;
}

export async function getUniswapQuote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  fee = 500
) {
  const iface = new ethers.Interface(UNISWAP_ABI);
  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn,
    tokenOut,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][Uniswap][QUOTE] params:", {
    tokenIn,
    tokenOut,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: UNISWAP_QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][Uniswap][QUOTE] provider.call failed", {
      tokenIn,
      tokenOut,
      amountIn,
      amountInUnits: amountInUnits.toString(),
      fee,
      callData,
      err: err && err.message ? err.message : err,
    });
    throw err;
  }

  console.debug("[QUOTER][Uniswap][QUOTE] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);
  console.debug("[QUOTER][Uniswap][QUOTE] decoded amountOut:", decoded[0].toString());
  return decoded[0] as bigint;
}
