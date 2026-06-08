require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@typechain/hardhat");
require("hardhat/config");

const ARBITRUM_SEPOLIA_RPC = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const ARBITRUM_ONE_RPC = process.env.ARBITRUM_ONE_RPC || "https://arb1.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 421614,
    },
    arbitrumOne: {
      url: ARBITRUM_ONE_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 42161,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};
