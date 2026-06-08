const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashLoanArbitrage route execution", function () {
  const LOAN_AMOUNT = ethers.parseUnits("1000", 6);
  const PREMIUM = (LOAN_AMOUNT * 5n) / 10000n;
  const UNISWAP_FEE = 3000;

  async function deployFixture() {
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USDC", "USDC", 6);
    const weth = await (await ethers.getContractFactory("MockERC20")).deploy("WETH", "WETH", 18);
    const buyRouter = await (await ethers.getContractFactory("MockUniswapRouter")).deploy();
    const sellRouter = await (await ethers.getContractFactory("MockDEXRouter")).deploy();
    const pool = await (await ethers.getContractFactory("MockAavePool")).deploy();
    const flashLoan = await (await ethers.getContractFactory("FlashLoanArbitrage")).deploy(false);

    await flashLoan.setAavePool(await pool.getAddress());
    await flashLoan.setDexRouters(
      await buyRouter.getAddress(),
      await sellRouter.getAddress(),
      await sellRouter.getAddress()
    );
    await flashLoan.setGasBuffer(0);

    await usdc.mint(await pool.getAddress(), ethers.parseUnits("1000000", 6));
    await weth.mint(await buyRouter.getAddress(), ethers.parseUnits("1000000", 18));
    await weth.mint(await sellRouter.getAddress(), ethers.parseUnits("1000000", 18));
    await usdc.mint(await sellRouter.getAddress(), ethers.parseUnits("1000000", 6));
    await buyRouter.setRateBps(10000);
    await sellRouter.setRateBps(10020);

    return { usdc, weth, buyRouter, sellRouter, flashLoan };
  }

  it("executes USDC -> WETH -> USDC and emits route events", async function () {
    const { usdc, weth, buyRouter, sellRouter, flashLoan } = await deployFixture();

    const route = {
      tokenIn: await usdc.getAddress(),
      tokenOut: await weth.getAddress(),
      buyDex: await buyRouter.getAddress(),
      sellDex: await sellRouter.getAddress(),
      amountIn: LOAN_AMOUNT,
      minProfit: 1n,
      buyFee: UNISWAP_FEE,
      sellFee: UNISWAP_FEE,
      minAmountAfterBuy: (LOAN_AMOUNT * 99n) / 100n,
      minAmountAfterSell: LOAN_AMOUNT + PREMIUM + 1n,
    };

    await expect(flashLoan.requestFlashLoanWithRoute(await usdc.getAddress(), route))
      .to.emit(flashLoan, "ArbitrageStarted")
      .and.to.emit(flashLoan, "SwapExecuted")
      .and.to.emit(flashLoan, "ArbitrageCompleted")
      .and.to.emit(flashLoan, "ProfitRealized")
      .and.to.emit(flashLoan, "FlashLoanExecuted");

    expect(await flashLoan.getBalance(await usdc.getAddress())).to.be.gt(0);
    expect(await flashLoan.totalExecutions()).to.equal(1);
  });

  it("reverts when sell output cannot repay flash loan", async function () {
    const { usdc, weth, buyRouter, sellRouter, flashLoan } = await deployFixture();
    await sellRouter.setRateBps(10000);

    const route = {
      tokenIn: await usdc.getAddress(),
      tokenOut: await weth.getAddress(),
      buyDex: await buyRouter.getAddress(),
      sellDex: await sellRouter.getAddress(),
      amountIn: LOAN_AMOUNT,
      minProfit: 0n,
      buyFee: UNISWAP_FEE,
      sellFee: UNISWAP_FEE,
      minAmountAfterBuy: (LOAN_AMOUNT * 99n) / 100n,
      minAmountAfterSell: LOAN_AMOUNT,
    };

    await expect(
      flashLoan.requestFlashLoanWithRoute(await usdc.getAddress(), route)
    ).to.be.reverted;
  });
});
