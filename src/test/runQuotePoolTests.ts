import assert from "assert";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { ADDRESSES } from "../config/addresses";
import { TOKENS } from "../config/tokens";
import { assertPoolMetadata, PoolMetadata, PoolMetadataError } from "../types/poolMetadata";
import { quotePool, quoteV2, quoteV3 } from "../quotes/quotePool";
import { findBestSushiPool } from "../discovery/sushiPoolDiscovery";
import { findBestPancakePool } from "../discovery/pancakePoolDiscovery";
import { quotePancakePool } from "../quotes/pancakeV3Quote";

dotenv.config();

const WETH_SUSHI_V3: PoolMetadata = {
  poolAddress: "0xf3Eb87C1F6020982173C908E7eB31aA66c1f0296",
  dex: "SUSHI",
  poolType: "V3",
  feeTier: 500,
  token0: ADDRESSES.USDC,
  token1: TOKENS.WETH.address,
  liquidity: 0n,
};

function basePool(overrides: Partial<PoolMetadata> = {}): PoolMetadata {
  return { ...WETH_SUSHI_V3, ...overrides };
}

async function expectThrows(fn: () => Promise<unknown>, pattern: RegExp, label: string) {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    assert.match(String(err), pattern, `${label}: wrong error message`);
  }
  assert.equal(threw, true, `${label}: expected throw`);
}

async function run() {
  let passed = 0;

  const checks: Array<{ name: string; fn: () => void | Promise<void> }> = [
    {
      name: "rejects missing poolType",
      fn: () => {
        assert.throws(
          () => assertPoolMetadata(basePool({ poolType: "" as "V3" })),
          PoolMetadataError
        );
      },
    },
    {
      name: "rejects missing poolAddress",
      fn: () => {
        assert.throws(() => assertPoolMetadata(basePool({ poolAddress: "" })), PoolMetadataError);
      },
    },
    {
      name: "rejects missing token0",
      fn: () => {
        assert.throws(() => assertPoolMetadata(basePool({ token0: "" })), PoolMetadataError);
      },
    },
    {
      name: "rejects missing token1",
      fn: () => {
        assert.throws(() => assertPoolMetadata(basePool({ token1: "" })), PoolMetadataError);
      },
    },
    {
      name: "rejects V3 pool without feeTier",
      fn: () => {
        assert.throws(
          () => assertPoolMetadata(basePool({ feeTier: undefined as unknown as number })),
          /feeTier/
        );
      },
    },
    {
      name: "rejects invalid pool type in quotePool",
      fn: async () => {
        const provider = ethers.getDefaultProvider("http://127.0.0.1:1");
        await expectThrows(
          () =>
            quotePool(
              provider,
              basePool({ poolType: "V4" as "V3" }),
              ADDRESSES.USDC,
              TOKENS.WETH.address,
              "100",
              6
            ),
          /Invalid pool type/,
          "invalid pool type"
        );
      },
    },
  ];

  for (const check of checks) {
    await check.fn();
    passed += 1;
    console.log(`✅ ${check.name}`);
  }

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    console.log(`\n${passed} unit tests passed (RPC integration tests skipped — no RPC_URL)`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const out = await quotePool(
    provider,
    WETH_SUSHI_V3,
    ADDRESSES.USDC,
    TOKENS.WETH.address,
    "100",
    6
  );
  assert.ok(out > 0n, "Sushi V3 quote should return positive output");
  passed += 1;
  console.log("✅ quotes Sushi V3 pool via quoter");

  await expectThrows(
    () =>
      quoteV2(provider, basePool({ poolType: "V2" }), ADDRESSES.USDC, TOKENS.WETH.address, "100", 6),
    /getReserves\(\) failed/,
    "V2 on V3 pool"
  );
  passed += 1;
  console.log("✅ rejects V2 math on V3 pool — no balanceOf fallback");

  await expectThrows(
    () =>
      quoteV2(
        provider,
        basePool({
          poolAddress: "0x0000000000000000000000000000000000000001",
          poolType: "V2",
          feeTier: 0,
        }),
        ADDRESSES.USDC,
        TOKENS.WETH.address,
        "100",
        6
      ),
    /getReserves\(\) failed/,
    "invalid pool address"
  );
  passed += 1;
  console.log("✅ rejects invalid pool address for V2");

  const pool = await findBestSushiPool(provider, ADDRESSES.USDC, TOKENS.WETH.address);
  assert.ok(pool, "discovery should find Sushi pool");
  assert.equal(pool.poolType, "V3");
  assert.ok(pool.poolAddress);
  assert.ok(pool.token0);
  assert.ok(pool.token1);
  assert.ok([500, 3000, 10000].includes(pool.feeTier));
  assertPoolMetadata(pool);
  passed += 1;
  console.log("✅ discovery returns full metadata for Sushi V3");

  const pancakePool = await findBestPancakePool(provider, ADDRESSES.USDC, TOKENS.WETH.address);
  assert.ok(pancakePool, "discovery should find Pancake pool");
  assert.equal(pancakePool.dex, "PANCAKESWAP");
  assert.equal(pancakePool.poolType, "V3");
  assertPoolMetadata(pancakePool);
  passed += 1;
  console.log("✅ discovery returns full metadata for Pancake V3");

  const pancakeOut = await quotePancakePool(
    provider,
    pancakePool,
    ADDRESSES.USDC,
    TOKENS.WETH.address,
    "100",
    6
  );
  assert.ok(pancakeOut > 0n, "Pancake V3 quote should return positive output");
  passed += 1;
  console.log("✅ quotes Pancake V3 pool via quoter");

  console.log(`\nAll ${passed} tests passed`);
}

run().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
