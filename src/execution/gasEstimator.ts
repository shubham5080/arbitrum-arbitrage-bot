import { ethers } from "ethers";
import { calculateFlashFee } from "../utils/feeCalculator";
import { getUniswapSellQuote } from "../quotes/quoteEngine";
import { TOKENS } from "../config/tokens";

const FLASH_LOAN_GAS = 90000;
const SWAP_GAS = 125000;
const REPAYMENT_GAS = 50000;
const DEFAULT_WETH_PRICE_USDC = 1600;

export async function estimateExecutionGas(
  provider: ethers.Provider,
  tradeSize: number
) {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  const gasUsed = FLASH_LOAN_GAS + SWAP_GAS * 2 + REPAYMENT_GAS;
  const gasCostWei = gasPrice * BigInt(gasUsed);
  const gasCostEth = Number(ethers.formatEther(gasCostWei));
  const wethPriceUsdc = await getWethPriceInUsdc(provider);
  const gasCostUSD = Number((gasCostEth * wethPriceUsdc).toFixed(6));
  const flashFee = calculateFlashFee(tradeSize);

  return {
    gasUsed,
    gasCostUSD,
    flashFee,
    profitAfterGas: Number((tradeSize - gasCostUSD - flashFee).toFixed(6)),
    gasPriceGwei: Number(gasPrice / 1000000000n),
    estimatedGasPriceWei: gasPrice,
    estimatedWethPriceUsdc: wethPriceUsdc,
  };
}

async function getWethPriceInUsdc(provider: ethers.Provider) {
  try {
    const wethToken = TOKENS.WETH!;
    const quote = await getUniswapSellQuote(
      provider,
      wethToken.address,
      wethToken.decimals,
      "1.0"
    );
    return Number(ethers.formatUnits(quote, 6));
  } catch {
    return DEFAULT_WETH_PRICE_USDC;
  }
}
