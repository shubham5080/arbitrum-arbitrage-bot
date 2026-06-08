// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAaveAddresses
 * @dev Interface for Aave V3 contract addresses
 */
interface IAaveAddresses {
    /**
     * @dev Returns the PoolAddressesProvider address
     */
    function getPoolAddressesProvider() external view returns (address);

    /**
     * @dev Returns the Pool address
     */
    function getPool() external view returns (address);

    /**
     * @dev Returns the WETH address
     */
    function getWETH() external view returns (address);

    /**
     * @dev Returns the USDC address
     */
    function getUSDC() external view returns (address);

    /**
     * @dev Returns the USDT address
     */
    function getUSDT() external view returns (address);

    /**
     * @dev Returns the DAI address
     */
    function getDAI() external view returns (address);
}
