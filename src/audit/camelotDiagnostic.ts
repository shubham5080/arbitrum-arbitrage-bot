import dotenv from "dotenv";
import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const FACTORY_ABI = ["function getPool(address,address,uint24) external view returns (address)"];

async function main() {
  console.log("=== Camelot Factory Diagnostic ===\n");
  
  const factory = new ethers.Contract(
    ADDRESSES.CAMELOT_AMMV2_FACTORY,
    FACTORY_ABI,
    provider
  ) as any;

  console.log(`Factory address: ${ADDRESSES.CAMELOT_AMMV2_FACTORY}`);
  
  const USDC = ADDRESSES.USDC;
  const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
  const ARB = "0x912ce59144191c1204e64559fe8253a0e49e6548";
  const LINK = "0xf97f4df75117a78c1a5a0dbb814af92458539fb4";

  const tokens = [
    { name: "WETH", addr: WETH },
    { name: "ARB", addr: ARB },
    { name: "LINK", addr: LINK },
  ];

  const fees = [500, 3000, 10000];

  for (const token of tokens) {
    console.log(`\n--- ${token.name} / USDC ---`);
    
    for (const fee of fees) {
      try {
        const poolAddr = await factory.getPool(token.addr, USDC, fee);
        console.log(`  Fee ${fee}: ${poolAddr === ethers.ZeroAddress ? "❌ zero address" : `✅ ${poolAddr}`}`);
      } catch (e) {
        console.log(`  Fee ${fee}: ❌ error - ${String(e).slice(0, 60)}`);
      }
      
      try {
        const poolAddr = await factory.getPool(USDC, token.addr, fee);
        console.log(`  Fee ${fee} (reversed): ${poolAddr === ethers.ZeroAddress ? "❌ zero address" : `✅ ${poolAddr}`}`);
      } catch (e) {
        console.log(`  Fee ${fee} (reversed): ❌ error - ${String(e).slice(0, 60)}`);
      }
    }
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
