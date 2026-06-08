// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SwapHelpers
 * @dev Helper functions for DEX swaps
 */
library SwapHelpers {
    /**
     * @dev Encodes two token addresses and a fee into a Uniswap V3 path
     * @param tokenIn Input token
     * @param fee Pool fee
     * @param tokenOut Output token
     * @return Encoded path
     */
    function encodeUniswapPath(
        address tokenIn,
        uint24 fee,
        address tokenOut
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(tokenIn, fee, tokenOut);
    }

    /**
     * @dev Calculates minimum output with slippage
     * @param expectedOutput Expected output amount
     * @param slippageBps Slippage in basis points
     * @return Minimum acceptable output
     */
    function calculateMinimumOutput(
        uint256 expectedOutput,
        uint256 slippageBps
    ) internal pure returns (uint256) {
        require(slippageBps <= 10000, "Slippage exceeds 100%");
        return (expectedOutput * (10000 - slippageBps)) / 10000;
    }

    /**
     * @dev Calculates slippage percentage
     * @param expected Expected amount
     * @param actual Actual amount
     * @return Slippage in basis points
     */
    function calculateSlippage(
        uint256 expected,
        uint256 actual
    ) internal pure returns (uint256) {
        if (expected == 0) return 0;
        if (actual >= expected) return 0;
        return ((expected - actual) * 10000) / expected;
    }

    /**
     * @dev Approves a token for spending by a spender
     * @param token Token to approve
     * @param spender Address to approve
     * @param amount Amount to approve
     */
    function approveIfNeeded(
        address token,
        address spender,
        uint256 amount
    ) internal {
        uint256 allowance = IERC20(token).allowance(address(this), spender);
        if (allowance < amount) {
            IERC20(token).approve(spender, type(uint256).max);
        }
    }

    /**
     * @dev Gets the balance of a token for this contract
     * @param token Token address
     * @return Balance
     */
    function getBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Checks if a swap would be profitable
     * @param borrowAmount Amount borrowed
     * @param premium Fee to repay
     * @param finalBalance Balance after swaps
     * @return isProfitable Whether swap is profitable
     * @return profit Net profit
     */
    function validateProfit(
        uint256 borrowAmount,
        uint256 premium,
        uint256 finalBalance
    ) internal pure returns (bool, uint256) {
        uint256 totalRepayment = borrowAmount + premium;
        if (finalBalance >= totalRepayment) {
            return (true, finalBalance - totalRepayment);
        }
        return (false, 0);
    }

    /**
     * @dev Validates that slippage is within acceptable range
     * @param expectedAmount Expected output
     * @param actualAmount Actual output
     * @param maxSlippageBps Maximum allowed slippage
     * @return bool Whether slippage is acceptable
     */
    function isSlippageAcceptable(
        uint256 expectedAmount,
        uint256 actualAmount,
        uint256 maxSlippageBps
    ) internal pure returns (bool) {
        if (actualAmount >= expectedAmount) return true;
        uint256 slippage = calculateSlippage(expectedAmount, actualAmount);
        return slippage <= maxSlippageBps;
    }

    /**
     * @dev Calculates output with fee deduction
     * @param amountIn Input amount
     * @param fee Fee in basis points
     * @return Output after fee
     */
    function calculateOutputAfterFee(
        uint256 amountIn,
        uint256 fee
    ) internal pure returns (uint256) {
        return (amountIn * (10000 - fee)) / 10000;
    }

    /**
     * @dev Validates route tuple
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param borrowAmount Amount to borrow
     * @return Valid route
     */
    function validateRoute(
        address tokenIn,
        address tokenOut,
        uint256 borrowAmount
    ) internal pure returns (bool) {
        require(tokenIn != address(0), "Invalid tokenIn");
        require(tokenOut != address(0), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Tokens must be different");
        require(borrowAmount > 0, "Borrow amount must be > 0");
        return true;
    }
}
