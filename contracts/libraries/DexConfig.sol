// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DexConfig
 * @dev DEX router addresses for Arbitrum mainnet and Sepolia testnet
 */
library DexConfig {
    address internal constant UNISWAP_ARBITRUM = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address internal constant SUSHI_ARBITRUM = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    address internal constant CAMELOT_ARBITRUM = 0x4ee15342d6Deb297c3A2aA7CFFd451f788675F53;

    // Uniswap V3 SwapRouter uses the same address on Arbitrum Sepolia.
    // Sushi/Camelot are not deployed on Sepolia; tests use Uniswap for both legs.
    address internal constant UNISWAP_SEPOLIA = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    function getDexRouters(bool isMainnet)
        internal
        pure
        returns (address uniswap, address sushi, address camelot)
    {
        if (isMainnet) {
            return (UNISWAP_ARBITRUM, SUSHI_ARBITRUM, CAMELOT_ARBITRUM);
        }
        return (UNISWAP_SEPOLIA, UNISWAP_SEPOLIA, UNISWAP_SEPOLIA);
    }
}
