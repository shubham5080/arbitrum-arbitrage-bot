import { ethers } from "ethers";
import { getUniswapV3Prices } from "../quotes/uniswapPrice";
import { TOKENS } from "../config/tokens";
import { DEXES } from "../config/dexes";
import { getUniswapBuyQuote, getUniswapSellQuote } from "../quotes/getUniswapBuyQuote";
import { getSushiBuyQuote, getSushiSellQuote } from "../quotes/getSushiBuyQuote";
import * as fs from "fs";

const provider = new ethers.JsonRpcProvider(
  process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc"
);

interface PriceCheckResult {
  pair: string;
  leg1: { token: string; quote: number; dex: string };
  leg2: { token: string; quote: number; dex: string };
  leg3: { token: string; quote: number; dex: string };
  initialAmount: number;
  finalAmount: number;
  profitPercent: number;
  timestamp: string;
}

async function validateSinglePair() {
  console.log("=== Single Pair Validation (WETH -> ARB -> USDC) ===\n");

  try {
    // Define the test pair
    const tokenPath = [TOKENS.WETH.address, TOKENS.ARB.address, TOKENS.USDC.address];
    const dexCombo = [DEXES.UNISWAP, DEXES.SUSHI, DEXES.UNISWAP];
    const initialAmount = 1.0; // 1 WETH

    console.log(`Token Path: WETH -> ARB -> USDC`);
    console.log(`DEX Combo: ${dexCombo.join(" -> ")}`);
    console.log(`Initial Amount: ${initialAmount} WETH\n`);

    // Step 1: Leg 1 - Buy ARB with WETH (UNISWAP)
    console.log("--- Leg 1: Buy ARB with WETH (Uniswap) ---");
    let leg1Output = 0;
    try {
      const leg1 = await getUniswapBuyQuote(
        TOKENS.WETH.address,
        TOKENS.ARB.address,
        ethers.parseUnits(initialAmount.toString(), TOKENS.WETH.decimals)
      );
      leg1Output = parseFloat(
        ethers.formatUnits(leg1, TOKENS.ARB.decimals)
      );
      console.log(`Input: ${initialAmount} WETH`);
      console.log(`Output: ${leg1Output.toFixed(6)} ARB`);
      console.log(`Price: ${(leg1Output / initialAmount).toFixed(6)} ARB/WETH\n`);
    } catch (err) {
      console.error(`Leg 1 failed: ${err}\n`);
      return;
    }

    // Step 2: Leg 2 - Buy USDC with ARB (SUSHI)
    console.log("--- Leg 2: Buy USDC with ARB (Sushi) ---");
    let leg2Output = 0;
    try {
      const leg2 = await getSushiBuyQuote(
        TOKENS.ARB.address,
        TOKENS.USDC.address,
        ethers.parseUnits(leg1Output.toString(), TOKENS.ARB.decimals)
      );
      leg2Output = parseFloat(
        ethers.formatUnits(leg2, TOKENS.USDC.decimals)
      );
      console.log(`Input: ${leg1Output.toFixed(6)} ARB`);
      console.log(`Output: ${leg2Output.toFixed(6)} USDC`);
      console.log(`Price: ${(leg2Output / leg1Output).toFixed(6)} USDC/ARB\n`);
    } catch (err) {
      console.error(`Leg 2 failed: ${err}\n`);
      return;
    }

    // Step 3: Leg 3 - Sell USDC for WETH (UNISWAP)
    console.log("--- Leg 3: Sell USDC for WETH (Uniswap) ---");
    let leg3Output = 0;
    try {
      const leg3 = await getUniswapSellQuote(
        TOKENS.USDC.address,
        TOKENS.WETH.address,
        ethers.parseUnits(leg2Output.toString(), TOKENS.USDC.decimals)
      );
      leg3Output = parseFloat(
        ethers.formatUnits(leg3, TOKENS.WETH.decimals)
      );
      console.log(`Input: ${leg2Output.toFixed(6)} USDC`);
      console.log(`Output: ${leg3Output.toFixed(6)} WETH`);
      console.log(`Price: ${(leg3Output / leg2Output).toFixed(6)} WETH/USDC\n`);
    } catch (err) {
      console.error(`Leg 3 failed: ${err}\n`);
      return;
    }

    // Calculate profit
    const profitWETH = leg3Output - initialAmount;
    const profitPercent = ((profitWETH / initialAmount) * 100).toFixed(4);

    console.log("=== RESULT ===");
    console.log(`Initial: ${initialAmount} WETH`);
    console.log(`Final: ${leg3Output.toFixed(6)} WETH`);
    console.log(`Profit: ${profitWETH.toFixed(6)} WETH (${profitPercent}%)\n`);

    // Determine status
    const status =
      profitWETH > 0
        ? "✅ PROFITABLE"
        : profitWETH < -0.001
          ? "❌ LOSS"
          : "⚠️  BREAK-EVEN";
    console.log(`Status: ${status}\n`);

    // Log result
    const result: PriceCheckResult = {
      pair: "WETH->ARB->USDC",
      leg1: { token: "ARB", quote: leg1Output, dex: DEXES.UNISWAP },
      leg2: { token: "USDC", quote: leg2Output, dex: DEXES.SUSHI },
      leg3: { token: "WETH", quote: leg3Output, dex: DEXES.UNISWAP },
      initialAmount,
      finalAmount: leg3Output,
      profitPercent: parseFloat(profitPercent),
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      "logs/single_pair_validation.json",
      JSON.stringify(result, null, 2)
    );
    console.log("Result saved to logs/single_pair_validation.json");
  } catch (err) {
    console.error("Validation failed:", err);
  }
}

validateSinglePair().catch(console.error);
