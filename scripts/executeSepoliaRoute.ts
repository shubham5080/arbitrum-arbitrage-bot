/**
 * Sepolia test: USDC -> WETH -> USDC via Uniswap V3 flash-loan route
 *
 * Usage:
 *   export ARBITRUM_SEPOLIA_RPC=...
 *   export PRIVATE_KEY=...
 *   export FLASH_LOAN_CONTRACT=0x...   # deployed FlashLoanArbitrage on Sepolia
 *   npx hardhat run scripts/executeSepoliaRoute.ts --network arbitrumSepolia
 */
import { ethers } from "hardhat";
import { encodeRoute } from "../src/execution/routeEncoder";
import { SEPOLIA_TOKENS, UNISWAP_FEE_TIERS } from "../src/config/dexRouters";

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut,uint160,uint32,uint256)",
];

// Uniswap V3 QuoterV2 on Arbitrum Sepolia
const QUOTER_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

async function main() {
  const contractAddress = process.env.FLASH_LOAN_CONTRACT;
  if (!contractAddress) {
    throw new Error("Set FLASH_LOAN_CONTRACT to a deployed FlashLoanArbitrage address");
  }

  const [signer] = await ethers.getSigners();
  const amountIn = ethers.parseUnits(process.env.ROUTE_AMOUNT_USDC ?? "100", 6);

  console.log("Sepolia route test: USDC -> WETH -> USDC");
  console.log(`Signer: ${signer.address}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`Borrow amount: ${ethers.formatUnits(amountIn, 6)} USDC\n`);

  const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, signer);
  const fee = UNISWAP_FEE_TIERS.MEDIUM;

  const buyQuote = await quoter.quoteExactInputSingle.staticCall({
    tokenIn: SEPOLIA_TOKENS.USDC,
    tokenOut: SEPOLIA_TOKENS.WETH,
    amountIn,
    fee,
    sqrtPriceLimitX96: 0,
  });
  const expectedWethOut = buyQuote[0] as bigint;

  const sellQuote = await quoter.quoteExactInputSingle.staticCall({
    tokenIn: SEPOLIA_TOKENS.WETH,
    tokenOut: SEPOLIA_TOKENS.USDC,
    amountIn: expectedWethOut,
    fee,
    sqrtPriceLimitX96: 0,
  });
  const expectedUsdcOut = sellQuote[0] as bigint;

  console.log(`Quoted buy output:  ${ethers.formatUnits(expectedWethOut, 18)} WETH`);
  console.log(`Quoted sell output: ${ethers.formatUnits(expectedUsdcOut, 6)} USDC`);

  const route = encodeRoute({
    tokenIn: SEPOLIA_TOKENS.USDC,
    tokenOut: SEPOLIA_TOKENS.WETH,
    amountIn,
    network: "arbitrumSepolia",
    slippageBps: 100,
    minProfitUsd: 0,
    buyFee: fee,
    sellFee: fee,
    expectedBuyOutput: expectedWethOut,
    expectedSellOutput: expectedUsdcOut,
    tokenInDecimals: 6,
  });

  const flashLoan = await ethers.getContractAt("FlashLoanArbitrage", contractAddress, signer);

  console.log("\nSubmitting requestFlashLoanWithRoute...");
  const tx = await flashLoan.requestFlashLoanWithRoute(SEPOLIA_TOKENS.USDC, {
    tokenIn: route.tokenIn,
    tokenOut: route.tokenOut,
    buyDex: route.buyDex,
    sellDex: route.sellDex,
    amountIn: route.amountIn,
    minProfit: 0,
    buyFee: route.buyFee,
    sellFee: route.sellFee,
    minAmountAfterBuy: route.minAmountAfterBuy,
    minAmountAfterSell: route.minAmountAfterSell,
  });

  const receipt = await tx.wait();
  console.log(`Tx hash: ${receipt?.hash}`);
  console.log("Route execution submitted. Inspect logs for ArbitrageCompleted / ProfitRealized.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
