// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ExecutionTypes
 * @dev Shared types for arbitrage route execution
 */

/**
 * @notice Complete arbitrage route passed from off-chain planner
 */
struct ArbitrageRoute {
    address tokenIn;
    address tokenOut;
    address buyDex;
    address sellDex;
    uint256 amountIn;
    uint256 minProfit;
    uint24 buyFee;
    uint24 sellFee;
    uint256 minAmountAfterBuy;
    uint256 minAmountAfterSell;
}

/**
 * @notice Result of a swap execution
 */
struct SwapResult {
    uint256 amountIn;
    uint256 amountOut;
    address dex;
    bool success;
    string errorReason;
    uint256 gasUsed;
}

/**
 * @notice Complete execution result
 */
struct ExecutionResult {
    ArbitrageRoute route;
    SwapResult buyResult;
    SwapResult sellResult;
    uint256 finalBalance;
    uint256 profit;
    uint256 premiumPaid;
    uint256 totalGasUsed;
    bool success;
    uint256 executionTime;
}
