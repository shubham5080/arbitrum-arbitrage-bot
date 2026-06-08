import dotenv from "dotenv";
import { ethers, Contract, Signer, TransactionReceipt } from "ethers";
import { ExecutionPlanResult } from "./executionTypes";
import { encodeRouteFromPlan } from "./routeEncoder";
import { TransactionBuilder } from "./transactionBuilder";

dotenv.config();

const FLASH_LOAN_ARBITRAGE_ABI = [
  "function requestFlashLoanWithRoute(address asset,(address tokenIn,address tokenOut,address buyDex,address sellDex,uint256 amountIn,uint256 minProfit,uint24 buyFee,uint24 sellFee,uint256 minAmountAfterBuy,uint256 minAmountAfterSell) route)",
  "event ArbitrageStarted(uint256 indexed routeId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 timestamp)",
  "event ArbitrageCompleted(uint256 indexed routeId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 finalBalance,uint256 profit,uint256 gasUsed,uint256 timestamp)",
  "event ProfitRealized(uint256 indexed routeId,address indexed token,uint256 profit,uint256 gasUsed,uint256 timestamp)",
  "event ExecutionFailed(uint256 indexed routeId,address indexed tokenIn,string reason,uint256 timestamp)",
] as const;

export interface ContractExecutionResult {
  receipt: TransactionReceipt;
  routeId?: bigint;
  profit?: bigint;
  gasUsed?: bigint;
  failedReason?: string;
}

export class ContractExecutor {
  private readonly builder: TransactionBuilder;
  private readonly contract: Contract;

  constructor(
    private readonly contractAddress: string,
    private readonly signer: Signer
  ) {
    this.builder = new TransactionBuilder(contractAddress);
    this.contract = new Contract(contractAddress, FLASH_LOAN_ARBITRAGE_ABI, signer);
  }

  async executePlan(
    plan: ExecutionPlanResult,
    params: {
      tokenIn: string;
      tokenOut: string;
      tokenInDecimals: number;
      network?: "arbitrumOne" | "arbitrumSepolia";
      slippageBps?: number;
      expectedBuyOutput: bigint;
      expectedSellOutput: bigint;
      buyFee?: number;
      sellFee?: number;
    }
  ): Promise<ContractExecutionResult> {
    const route = encodeRouteFromPlan(plan, params.tokenIn, params.tokenOut, params);
    return this.executeRoute(route);
  }

  async executeRoute(route: ReturnType<typeof encodeRouteFromPlan>): Promise<ContractExecutionResult> {
    const tx = await this.contract.requestFlashLoanWithRoute(route.tokenIn, {
      tokenIn: route.tokenIn,
      tokenOut: route.tokenOut,
      buyDex: route.buyDex,
      sellDex: route.sellDex,
      amountIn: route.amountIn,
      minProfit: route.minProfit,
      buyFee: route.buyFee,
      sellFee: route.sellFee,
      minAmountAfterBuy: route.minAmountAfterBuy,
      minAmountAfterSell: route.minAmountAfterSell,
    });

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction not mined");
    }

    return this.parseReceipt(receipt);
  }

  parseReceipt(receipt: TransactionReceipt): ContractExecutionResult {
    const iface = new ethers.Interface(FLASH_LOAN_ARBITRAGE_ABI);
    let routeId: bigint | undefined;
    let profit: bigint | undefined;
    let gasUsed: bigint | undefined;
    let failedReason: string | undefined;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (!parsed) continue;

        if (parsed.name === "ProfitRealized") {
          routeId = parsed.args.routeId as bigint;
          profit = parsed.args.profit as bigint;
          gasUsed = parsed.args.gasUsed as bigint;
        }
        if (parsed.name === "ExecutionFailed") {
          failedReason = parsed.args.reason as string;
        }
      } catch {
        // ignore unrelated logs
      }
    }

    return { receipt, ...(routeId !== undefined ? { routeId } : {}), ...(profit !== undefined ? { profit } : {}), ...(gasUsed !== undefined ? { gasUsed } : {}), ...(failedReason !== undefined ? { failedReason } : {}) };
  }

  buildUnsignedRouteTx(route: ReturnType<typeof encodeRouteFromPlan>) {
    return this.builder.buildRouteExecutionTx(route);
  }
}

export function createContractExecutor(
  contractAddress: string,
  privateKey?: string,
  rpcUrl?: string
): ContractExecutor {
  const url = rpcUrl ?? process.env.ARBITRUM_SEPOLIA_RPC ?? process.env.RPC_URL;
  const key = privateKey ?? process.env.PRIVATE_KEY;
  if (!url) throw new Error("RPC URL required");
  if (!key) throw new Error("PRIVATE_KEY required");

  const provider = new ethers.JsonRpcProvider(url);
  const signer = new ethers.Wallet(key, provider);
  return new ContractExecutor(contractAddress, signer);
}
