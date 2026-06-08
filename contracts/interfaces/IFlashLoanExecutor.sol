// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFlashLoanReceiver
 * @dev Interface for flash loan receivers (Aave V3 standard)
 */
interface IFlashLoanReceiver {
    /**
     * @dev Executes an operation after receiving flash loaned assets
     * @param asset The address of the borrowed asset
     * @param amount The amount borrowed
     * @param premium The fee for the flash loan
     * @param initiator The address initiating the flash loan
     * @param params Arbitrary data passed to the executor
     * @return bool true if operation was successful
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/**
 * @title IAavePool
 * @dev Minimal interface for Aave V3 Pool flash loan functionality
 */
interface IAavePool {
    /**
     * @dev Initiates a flash loan
     * @param receiver The address receiving the flash loan
     * @param token The address of the asset to flash loan
     * @param amount The amount to flash loan
     * @param userData Data passed to the receiver
     * @param onBehalfOf The address on behalf of which the flash loan is made
     * @param referralCode The referral code
     */
    function flashLoan(
        address receiver,
        address token,
        uint256 amount,
        bytes calldata userData,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @dev Returns the latest flash loan fee
     * @return The flash loan fee in basis points
     */
    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}

/**
 * @title IPoolAddressesProvider
 * @dev Minimal interface for getting the Pool address
 */
interface IPoolAddressesProvider {
    /**
     * @dev Returns the address of the Pool
     */
    function getPool() external view returns (address);
}
