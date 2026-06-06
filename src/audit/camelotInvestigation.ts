import dotenv from "dotenv";
import { ethers } from "ethers";
import { ADDRESSES } from "../config/addresses";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Camelot V3 (AMM) factory ABI - different from V2
// Camelot uses AlgebraFactory pattern, not Uniswap V3 pattern
const ALGEBRA_FACTORY_ABI = [
  "function getPool(address,address) external view returns (address)",
];

// Camelot V2 is older - let's check which is active
// Try both patterns

async function main() {
  console.log("\n=== Camelot Integration Investigation ===\n");

  const USDC = ADDRESSES.USDC;
  const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";

  console.log("Test 1: Check if factory has any code (is it a real contract?)\n");
  const factoryCode = await provider.getCode(ADDRESSES.CAMELOT_AMMV2_FACTORY);
  console.log(`Factory ${ADDRESSES.CAMELOT_AMMV2_FACTORY}:`);
  console.log(`  Has code: ${factoryCode !== "0x" ? "✅ YES" : "❌ NO"}`);

  if (factoryCode === "0x") {
    console.log("  → Factory address appears to be EOA or non-existent\n");
    return;
  }

  console.log("\nTest 2: Try Algebra pattern (getPool without fee)\n");
  
  try {
    const factory = new ethers.Contract(
      ADDRESSES.CAMELOT_AMMV2_FACTORY,
      ALGEBRA_FACTORY_ABI,
      provider
    ) as any;

    const poolAddr = await factory.getPool(WETH, USDC);
    console.log(`  Pool found: ${poolAddr}`);
    
    if (poolAddr === ethers.ZeroAddress) {
      console.log("  ⚠️  Zero address - pool doesn't exist");
    } else {
      console.log(`  ✅ Valid pool at ${poolAddr}`);
    }
  } catch (e) {
    console.log(`  ❌ Error: ${String(e).slice(0, 80)}`);
  }

  console.log("\nTest 3: Check factory bytecode size (hints at complexity)\n");
  const codeSize = factoryCode.length / 2 - 1; // bytes
  console.log(`  Bytecode size: ${codeSize} bytes`);
  if (codeSize > 20000) {
    console.log("  → Large bytecode suggests Algebra/complex AMM");
  } else {
    console.log("  → Smaller bytecode suggests simple AMM");
  }

  console.log("\nTest 4: Try direct pool address calculation (if hardcoded)\n");
  // Camelot pools might have known addresses or use CREATE2
  // Try fetching state from a known Camelot pool if we had one
  console.log("  (Skipping - would need known pool addresses)\n");

  console.log("Diagnosis:");
  console.log("---");
  console.log("If factory has code but getPool reverts:");
  console.log("  → Likely uses different method (Algebra pattern without fee)");
  console.log("  → OR pools are created differently");
  console.log("");
  console.log("If factory has no code:");
  console.log("  → Factory address is wrong");
  console.log("  → Need to find correct Camelot V3 factory on Arbitrum");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
