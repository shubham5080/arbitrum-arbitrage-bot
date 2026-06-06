import { ethers } from "ethers";

const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

const ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)"
];

export async function getSushiV3Quote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  tokenInDecimals: number,
  fee: number
) {
  const iface = new ethers.Interface(ABI);

  const amountInUnits = ethers.parseUnits(amountIn, tokenInDecimals);

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn,
    tokenOut,
    amountIn: amountInUnits,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  console.debug("[QUOTER][SushiV3] params:", {
    tokenIn,
    tokenOut,
    amountIn,
    amountInUnits: amountInUnits.toString(),
    fee,
    callData,
  });

  let res: string;
  try {
    res = (await provider.call({ to: QUOTER, data: callData })) as string;
  } catch (err: any) {
    console.error("[QUOTER][SushiV3] provider.call failed", {
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

  console.debug("[QUOTER][SushiV3] raw res:", res);
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);

  console.debug("[QUOTER][SushiV3] decoded amountOut:", decoded[0].toString());

  return decoded[0] as bigint;
}

export default getSushiV3Quote;
