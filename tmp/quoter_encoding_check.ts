import { ethers } from "ethers";

const RPC1 = (process.env.RPC_URL || "").trim();
const RPC2 = "https://arb1.arbitrum.io/rpc";
const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

const PAIRS = [
  {
    name: "USDC->WETH",
    tokenIn: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenOut: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    fee: 500,
    decimals: 6,
  },
  {
    name: "USDC->ARB",
    tokenIn: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenOut: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    fee: 500,
    decimals: 6,
  },
  {
    name: "USDC->LINK",
    tokenIn: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenOut: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    fee: 500,
    decimals: 6,
  },
];

const AMOUNTS = [100, 500, 1000, 5000];

const ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
];

const ABI_TUPLE = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut,uint160 sqrtPriceX96,uint24 fee,uint256 extra)",
];

async function run() {
  if (!RPC1) {
    console.error("RPC1 not set in .env RPC_URL");
    process.exit(1);
  }

  const provider1 = new ethers.JsonRpcProvider(RPC1);
  const provider2 = new ethers.JsonRpcProvider(RPC2);

  const iface = new ethers.Interface(ABI);
  const ifaceTuple = new ethers.Interface(ABI_TUPLE);

  console.log("ABI:", ABI[0]);
  console.log("Tuple ABI:", ABI_TUPLE[0]);

  for (const pair of PAIRS) {
    console.log(`\n================= ${pair.name} =================`);

    for (const amount of AMOUNTS) {
      const amountInUnits = ethers.parseUnits(amount.toString(), pair.decimals);
      const calldata = iface.encodeFunctionData("quoteExactInputSingle", [{
        tokenIn: pair.tokenIn,
        tokenOut: pair.tokenOut,
        amountIn: amountInUnits,
        fee: pair.fee,
        sqrtPriceLimitX96: 0n,
      }]);

      console.log(`\n-- amountIn: ${amount} (${pair.decimals} decimals) --`);
      console.log("callData length:", calldata.length);
      console.log("callData selector:", calldata.slice(0, 10));
      console.log("callData:", calldata);

      for (const [label, provider] of [["RPC1", provider1], ["RPC2", provider2]] as const) {
        try {
          const res = await provider.call({ to: QUOTER, data: calldata });
          console.log(`${label} raw res:`, res);
          try {
            const decoded = iface.decodeFunctionResult("quoteExactInputSingle", res);
            console.log(`${label} decoded uint256:`, decoded[0].toString());
          } catch (e) {
            console.log(`${label} decode uint256 failed:`, String(e));
          }
          try {
            const decodedTuple = ifaceTuple.decodeFunctionResult("quoteExactInputSingle", res);
            console.log(`${label} decoded tuple:`, decodedTuple.map((v: any) => v.toString()));
          } catch (e) {
            console.log(`${label} decode tuple failed:`, String(e));
          }
        } catch (err) {
          console.error(`${label} call failed:`, String(err));
        }
      }
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
