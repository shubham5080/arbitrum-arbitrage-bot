import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  initializeDatabase,
  initializeAuditTable,
  getProfitableOpportunities,
  getAllOpportunities,
  saveAuditResult,
  clearAuditResults,
  StoredOpportunity,
  StoredAuditResult,
} from "../database/database";
import {
  buildRouteContext,
  measureQuoteConsistency,
  QuoteSnapshot,
} from "./quoteConsistency";
import { auditSlippage, SlippageAuditResult } from "./slippageAuditor";
import { checkExecutionReality, ExecutionRealityResult } from "./executionRealityCheck";
import { AuditReportData, buildAuditReport, saveAuditReport } from "./auditReport";

dotenv.config();

export interface AuditedOpportunity {
  opportunity: StoredOpportunity;
  snapshots: QuoteSnapshot[];
  slippage: SlippageAuditResult;
  reality: ExecutionRealityResult;
}

export interface AuditRunSummary {
  auditedCount: number;
  uniqueRoutes: number;
  report: AuditReportData;
  reportPath: string;
}

function opportunityKey(opp: StoredOpportunity) {
  return `${opp.token}|${opp.route}|${opp.size}`;
}

function emptySlippage(scannerNetProfit: number): SlippageAuditResult {
  return {
    scannerProfit: scannerNetProfit,
    realisticProfit: Number.NEGATIVE_INFINITY,
    slippageLoss: Math.abs(scannerNetProfit),
    slippageLossPercent: 100,
    buyPoolImpact: 0,
    sellPoolImpact: 0,
    buyFeeBps: 0,
    sellFeeBps: 0,
    buyLiquidity: "0",
    sellLiquidity: "0",
  };
}

async function auditUniqueRoute(
  provider: ethers.Provider,
  token: string,
  route: string,
  size: number,
  representative: StoredOpportunity
): Promise<{ snapshots: QuoteSnapshot[]; slippage: SlippageAuditResult; reality: ExecutionRealityResult }> {
  const ctx = buildRouteContext(token, route, size);

  try {
    const snapshots = await measureQuoteConsistency(
      provider,
      ctx,
      representative.net_profit
    );
    const slippage = await auditSlippage(provider, ctx, representative.net_profit);
    const reality = await checkExecutionReality(
      provider,
      size,
      representative.net_profit,
      snapshots,
      slippage
    );
    return { snapshots, slippage, reality };
  } catch (error) {
    const snapshots = [0, 500, 1000, 2000].map((delayMs) => ({
      delayMs,
      grossProfit: Number.NEGATIVE_INFINITY,
      gasAdjustedProfit: Number.NEGATIVE_INFINITY,
      profitDecayPercent: 100,
      stillProfitable: false,
      buyTokenOut: 0,
      sellUsdcOut: 0,
    }));
    const slippage = emptySlippage(representative.net_profit);
    const reality = await checkExecutionReality(
      provider,
      size,
      representative.net_profit,
      snapshots,
      slippage
    );
    return {
      snapshots,
      slippage,
      reality: {
        ...reality,
        validationStatus: "FALSE_POSITIVE",
        executableStatus: "NOT_EXECUTABLE",
        executable: false,
        failureReason:
          error instanceof Error && error.message.includes("CALL_EXCEPTION")
            ? "pool call reverted"
            : error instanceof Error
              ? error.message
              : "quote fetch failed",
      },
    };
  }
}

export async function runScannerAudit(options?: {
  rpcUrl?: string;
  clearPrevious?: boolean;
}): Promise<AuditRunSummary> {
  const rpcUrl = options?.rpcUrl ?? process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("RPC_URL is required in .env to run scanner audit");
  }

  initializeDatabase();
  initializeAuditTable();

  if (options?.clearPrevious !== false) {
    clearAuditResults();
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const profitable = getProfitableOpportunities();

  if (profitable.length === 0) {
    throw new Error("No profitable opportunities found in database");
  }

  const uniqueMap = new Map<string, StoredOpportunity>();
  for (const opp of profitable) {
    const key = opportunityKey(opp);
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, opp);
    }
  }

  const audited: AuditedOpportunity[] = [];
  const cache = new Map<
    string,
    { snapshots: QuoteSnapshot[]; slippage: SlippageAuditResult; reality: ExecutionRealityResult }
  >();

  console.log(`\nAuditing ${profitable.length} profitable opportunities (${uniqueMap.size} unique routes)...\n`);

  for (const [key, representative] of uniqueMap.entries()) {
    console.log(`  Revalidating: ${representative.token} ${representative.route} $${representative.size}`);
    const result = await auditUniqueRoute(
      provider,
      representative.token,
      representative.route,
      representative.size,
      representative
    );
    cache.set(key, result);
  }

  const now = Math.floor(Date.now() / 1000);

  for (const opp of profitable) {
    const key = opportunityKey(opp);
    const result = cache.get(key);
    if (!result) continue;

    const record: StoredAuditResult = {
      opportunity_id: opp.id ?? 0,
      validation_status: result.reality.validationStatus,
      profit_original: result.reality.profitOriginal,
      profit_revalidated: result.reality.profitRevalidated,
      decay_percent: result.reality.decayPercent,
      executable: result.reality.executable ? 1 : 0,
      failure_reason: result.reality.failureReason,
      timestamp: now,
      token: opp.token,
      route: opp.route,
      size: opp.size,
      scanner_profit: result.slippage.scannerProfit,
      realistic_profit: result.slippage.realisticProfit,
      slippage_loss: result.slippage.slippageLoss,
      executable_status: result.reality.executableStatus,
      quote_snapshots_json: JSON.stringify(result.snapshots),
    };

    saveAuditResult(record);

    audited.push({
      opportunity: opp,
      snapshots: result.snapshots,
      slippage: result.slippage,
      reality: result.reality,
    });
  }

  const report = buildAuditReport(getAllOpportunities(), audited);
  const reportPath = saveAuditReport(report);

  console.log(`\nAudit complete: ${audited.length} rows saved, report at ${reportPath}\n`);

  return {
    auditedCount: audited.length,
    uniqueRoutes: uniqueMap.size,
    report,
    reportPath,
  };
}
