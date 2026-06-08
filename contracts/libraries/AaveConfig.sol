// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AaveConfig
 * @dev Centralized configuration for Aave V3 addresses on Arbitrum
 */
library AaveConfig {
    // Arbitrum Mainnet Aave V3 Addresses
    address public constant POOL_ADDRESSES_PROVIDER_ARBITRUM =
        0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;

    address public constant AAVE_POOL_ARBITRUM =
        0x794a61358D6845594F94dc1DB02A252b5b4814aD;

    // Token Addresses on Arbitrum (checksummed)
    address public constant USDC_ARBITRUM = 0xfF970a61a04B1ca14834A43f5De4533ebDDB5F86;
    address public constant USDT_ARBITRUM = 0xfD086Bc7Cd5C481Dcc9c85eba8C8d7Afca8CB801;
    address public constant WETH_ARBITRUM = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant ARB_ARBITRUM = 0x912CE59144191C1204E64559fe8253a0e49E6920;

    // Arbitrum Sepolia Testnet Aave V3 Addresses (for testing)
    address public constant POOL_ADDRESSES_PROVIDER_ARBITRUM_SEPOLIA =
        0x1A901f5e4D316Dfdda56D34881B3FCB69f6830d7;

    address public constant AAVE_POOL_ARBITRUM_SEPOLIA =
        0x6Ae43d3271Ff6888E7fc43Fd7321a6D5022dCbd1;

    // Token Addresses on Arbitrum Sepolia (checksummed)
    address public constant USDC_ARBITRUM_SEPOLIA = 0x75FAf514D9d7f7b38E0aAD4D18aDf84B7a431d26;
    address public constant USDT_ARBITRUM_SEPOLIA = 0x6ab707ACA953edaEfBc4fD23BA78284241B1A214;
    address public constant WETH_ARBITRUM_SEPOLIA = 0xe591BF4296BF6E4Ec5DAD3B59a3370207FEB0EA9;

    // Flash Loan Fee (in basis points, 0.05% = 5 basis points)
    uint128 public constant FLASHLOAN_PREMIUM = 5;

    /**
     * @dev Gets the configuration for a specific chain
     * @param isMainnet Whether to use mainnet or testnet addresses
     * @return poolProvider The PoolAddressesProvider address
     * @return pool The Aave Pool address
     * @return usdc The USDC token address
     * @return weth The WETH token address
     */
    function getConfig(bool isMainnet)
        internal
        pure
        returns (
            address poolProvider,
            address pool,
            address usdc,
            address weth
        )
    {
        if (isMainnet) {
            return (
                POOL_ADDRESSES_PROVIDER_ARBITRUM,
                AAVE_POOL_ARBITRUM,
                USDC_ARBITRUM,
                WETH_ARBITRUM
            );
        } else {
            return (
                POOL_ADDRESSES_PROVIDER_ARBITRUM_SEPOLIA,
                AAVE_POOL_ARBITRUM_SEPOLIA,
                USDC_ARBITRUM_SEPOLIA,
                WETH_ARBITRUM_SEPOLIA
            );
        }
    }
}
