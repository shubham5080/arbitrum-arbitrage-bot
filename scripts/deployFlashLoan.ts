import { ethers } from "hardhat";

async function main() {
  console.log("Deploying FlashLoanArbitrage contract...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(
    `Account balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`
  );

  // Check which network we're deploying to
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId: ${network.chainId})\n`);

  let isMainnet = false;
  if (network.chainId === 42161n) {
    isMainnet = true;
    console.log("Deploying to Arbitrum Mainnet");
  } else if (network.chainId === 421614n) {
    isMainnet = false;
    console.log("Deploying to Arbitrum Sepolia (Testnet)");
  } else {
    console.log("WARNING: Unknown network!");
  }

  // Deploy FlashLoanArbitrage
  console.log("\nDeploying FlashLoanArbitrage...");
  const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
  const flashLoan = await FlashLoanArbitrage.deploy(isMainnet);
  await flashLoan.waitForDeployment();

  const contractAddress = await flashLoan.getAddress();
  console.log(`FlashLoanArbitrage deployed to: ${contractAddress}\n`);

  // Verify contract state
  console.log("Verifying contract state...");
  const owner = await flashLoan.owner();
  console.log(`Owner: ${owner}`);

  const flashLoanPremium = await flashLoan.getFlashLoanPremium();
  console.log(`Flash Loan Premium (bps): ${flashLoanPremium}`);

  const minProfit = await flashLoan.minProfitBps();
  console.log(`Min Profit (bps): ${minProfit}`);

  const status = await flashLoan.getFlashLoanStatus();
  console.log(`Flash Loan In Progress: ${status.inProgress}`);

  // Print deployment info
  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Network: ${network.name}`);
  console.log(`Is Mainnet: ${isMainnet}`);

  // Save deployment info to file
  const fs = require("fs");
  const deploymentInfo = {
    contractAddress,
    network: network.name,
    chainId: Number(network.chainId),
    isMainnet,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString(),
  };

  const filename = `deployment-${network.chainId}.json`;
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to ${filename}`);

  // Instructions for next steps
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Verify the contract on Arbiscan");
  console.log("2. Test flash loan functionality with requestFlashLoan()");
  console.log("3. Monitor gas usage and optimize if needed");
  console.log("4. Test withdrawal functions");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
