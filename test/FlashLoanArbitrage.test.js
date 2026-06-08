const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashLoanArbitrage", function () {
  const USDC_ADDRESS = "0x75FAf514D9d7f7b38E0aAD4D18aDf84B7a431d26";
  const LOAN_AMOUNT = ethers.parseUnits("1000", 6);
  const PREMIUM_RATE = 5n;
  const FLASH_LOAN_PREMIUM = (LOAN_AMOUNT * PREMIUM_RATE) / 10000n;

  let flashLoan;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
    flashLoan = await FlashLoanArbitrage.deploy(false);
    await flashLoan.waitForDeployment();
  });

  it("initializes with correct owner", async function () {
    expect(await flashLoan.owner()).to.equal(owner.address);
  });

  it("calculates repayment correctly", async function () {
    const repayment = await flashLoan.calculateRepayment(LOAN_AMOUNT);
    expect(repayment).to.equal(LOAN_AMOUNT + FLASH_LOAN_PREMIUM);
  });

  it("blocks non-owner flash loan requests", async function () {
    await expect(
      flashLoan.connect(addr1).requestFlashLoan(USDC_ADDRESS, LOAN_AMOUNT)
    ).to.be.revertedWithCustomError(flashLoan, "OwnableUnauthorizedAccount");
  });

  it("defines execution events", async function () {
    expect(flashLoan.interface.getEvent("ArbitrageStarted")).to.not.be.null;
    expect(flashLoan.interface.getEvent("ProfitRealized")).to.not.be.null;
    expect(flashLoan.interface.getEvent("ExecutionFailed")).to.not.be.null;
  });
});
