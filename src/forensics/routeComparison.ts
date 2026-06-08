import { ethers } from "ethers";
import { StoredOpportunity } from "../database/database";
import { calculateFlashFee } from "../utils/feeCalculator";
import { estimateGasCost } from "../utils/gasEstimator";
import { traceOpportunityQuotes, traceScannerWrapper } from "./quoteTrace";
import { TOKENS } from "../config/tokens";

export interface RouteComparisonResult {
  opportunityId: number | null;
  token: string;
  route: string;
  size: number;
  scannerStoredNetProfit: number;
  forensicTracedNetProfit: number;
  scannerWrapperNetProfit: number;
  absoluteError: number;
  percentError: number;
  buyMethod: string;
  sellMethod: string;
  diverges: boolean;
}

async function getWethPriceUsdc(provider: ethers.Provider) {
  const weth = TOKENS.WETH!;
  const { getUniswapSellQuote } = await import("../quotes/quoteEngine");
  const quote = await getUniswapSellQuote(provider, weth.address, weth.decimals, "1.0");
  return Number(ethers.formatUnits(quote, 6));
}

export async function compareRoute(
  provider: ethers.Provider,
  opportunity: StoredOpportunity
): Promise<RouteComparisonResult> {
  const gasCostEth = await estimateGasCost(provider);
  const wethPrice = await getWethPriceUsdc(provider);
  const gasCostUsdc = Number((gasCostEth * wethPrice).toFixed(6));
  const flashFee = calculateFlashFee(opportunity.size);

  const trace = await traceOpportunityQuotes(provider, opportunity, gasCostUsdc, flashFee);

  let scannerWrapperNet = Number.NEGATIVE_INFINITY;
  try {
    const { buyOut, sellOut } = await traceScannerWrapper(provider, opportunity);
    const gross = Number(ethers.formatUnits(sellOut, 6)) - opportunity.size;
    scannerWrapperNet = Number((gross - gasCostUsdc - flashFee).toFixed(6));
  } catch {
    scannerWrapperNet = Number.NEGATIVE_INFINITY;
  }

  const absoluteError = Number(
    (opportunity.net_profit - trace.tracedNetProfit).toFixed(6)
  );
  const percentError =
    opportunity.net_profit !== 0
      ? Number(((absoluteError / Math.abs(opportunity.net_profit)) * 100).toFixed(2))
      : 100;

  return {
    opportunityId: opportunity.id ?? null,
    token: opportunity.token,
    route: opportunity.route,
    size: opportunity.size,
    scannerStoredNetProfit: opportunity.net_profit,
    forensicTracedNetProfit: trace.tracedNetProfit,
    scannerWrapperNetProfit: scannerWrapperNet,
    absoluteError,
    percentError,
    buyMethod: trace.buyLeg.quoteMethod,
    sellMethod: trace.sellLeg.quoteMethod,
    diverges: !Number.isFinite(trace.tracedNetProfit) || trace.tracedNetProfit <= 0,
  };
}
