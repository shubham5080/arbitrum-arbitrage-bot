import { Contract, Interface, Signer } from "ethers";
import { EncodedArbitrageRoute, toContractRoute } from "./routeEncoder";

const FLASH_LOAN_ARBITRAGE_ABI = [
  "function requestFlashLoanWithRoute(address asset,(address tokenIn,address tokenOut,address buyDex,address sellDex,uint256 amountIn,uint256 minProfit,uint24 buyFee,uint24 sellFee,uint256 minAmountAfterBuy,uint256 minAmountAfterSell) route)",
  "function requestFlashLoan(address asset,uint256 amount)",
  "function ownerWithdraw(address asset,uint256 amount)",
  "function setMaxSlippageBps(uint256 bps)",
  "function setGasBuffer(uint256 buffer)",
  "event ArbitrageStarted(uint256 indexed routeId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 timestamp)",
  "event ArbitrageCompleted(uint256 indexed routeId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 finalBalance,uint256 profit,uint256 gasUsed,uint256 timestamp)",
  "event ProfitRealized(uint256 indexed routeId,address indexed token,uint256 profit,uint256 gasUsed,uint256 timestamp)",
  "event ExecutionFailed(uint256 indexed routeId,address indexed tokenIn,string reason,uint256 timestamp)",
] as const;

export class TransactionBuilder {
  private readonly iface = new Interface(FLASH_LOAN_ARBITRAGE_ABI);

  constructor(private readonly contractAddress: string) {}

  buildRouteExecutionTx(route: EncodedArbitrageRoute) {
    const data = this.iface.encodeFunctionData("requestFlashLoanWithRoute", [
      route.tokenIn,
      toContractRoute(route),
    ]);

    return {
      to: this.contractAddress,
      data,
    };
  }

  buildWithdrawTx(asset: string, amount: bigint = 0n) {
    return {
      to: this.contractAddress,
      data: this.iface.encodeFunctionData("ownerWithdraw", [asset, amount]),
    };
  }

  attach(signer: Signer): Contract {
    return new Contract(this.contractAddress, FLASH_LOAN_ARBITRAGE_ABI, signer);
  }
}
