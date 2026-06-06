import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const QUOTER =
  "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

const USDC =
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const WETH =
  "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

const ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)"
];

async function main() {
  const iface = new ethers.Interface(ABI);

  const wethAmount = ethers.parseEther("6.25644920827129915");

  const callData = iface.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: WETH,
    tokenOut: USDC,
    amountIn: wethAmount,
    fee: 500,
    sqrtPriceLimitX96: 0
  }]);

  const res = await provider.call({ to: QUOTER, data: callData });
  const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);
  const amountOut = decoded[0];

  console.log("USDC Out:", ethers.formatUnits(amountOut, 6));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
