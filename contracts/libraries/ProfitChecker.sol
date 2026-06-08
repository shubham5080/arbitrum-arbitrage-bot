// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProfitChecker
 * @dev Library for calculating profit and validating flash loan repayment
 */
library ProfitChecker {
    /**
     * @dev Structure for holding profit calculation results
     */
    struct ProfitData {
        uint256 borrowAmount;
        uint256 premium;
        uint256 repaymentRequired;
        uint256 availableBalance;
        bool isProfitable;
        uint256 expectedProfit;
    }

    /**
     * @dev Calculates the flash loan premium
     * @param amount The borrowed amount
     * @param premiumRate The premium rate in basis points (e.g., 5 = 0.05%)
     * @return The premium amount
     */
    function calculatePremium(uint256 amount, uint128 premiumRate)
        internal
        pure
        returns (uint256)
    {
        return (amount * premiumRate) / 10_000;
    }

    /**
     * @dev Calculates total repayment required
     * @param borrowAmount The borrowed amount
     * @param premium The flash loan premium
     * @return The total repayment amount (principal + premium)
     */
    function calculateRepayment(uint256 borrowAmount, uint256 premium)
        internal
        pure
        returns (uint256)
    {
        return borrowAmount + premium;
    }

    /**
     * @dev Validates profitability of a flash loan operation
     * @param borrowAmount The amount borrowed
     * @param premium The flash loan premium
     * @param currentBalance The current balance available for repayment
     * @return profitData The profit calculation results
     */
    function validateProfitability(
        uint256 borrowAmount,
        uint256 premium,
        uint256 currentBalance
    ) internal pure returns (ProfitData memory profitData) {
        uint256 repaymentRequired = borrowAmount + premium;

        profitData.borrowAmount = borrowAmount;
        profitData.premium = premium;
        profitData.repaymentRequired = repaymentRequired;
        profitData.availableBalance = currentBalance;

        if (currentBalance >= repaymentRequired) {
            profitData.expectedProfit = currentBalance - repaymentRequired;
            profitData.isProfitable = true;
        } else {
            profitData.expectedProfit = 0;
            profitData.isProfitable = false;
        }
    }

    /**
     * @dev Checks if enough balance is available for repayment
     * @param balance The current balance
     * @param amount The amount to repay
     * @return bool true if sufficient balance, false otherwise
     */
    function hasSufficientBalance(uint256 balance, uint256 amount)
        internal
        pure
        returns (bool)
    {
        return balance >= amount;
    }

    /**
     * @dev Calculates the minimum profit threshold
     * @param borrowAmount The borrowed amount
     * @param premium The flash loan premium
     * @param minProfitBps Minimum profit in basis points (e.g., 10 = 0.1%)
     * @return The minimum required profit
     */
    function calculateMinProfitThreshold(
        uint256 borrowAmount,
        uint256 premium,
        uint256 minProfitBps
    ) internal pure returns (uint256) {
        // Minimum profit = (borrowAmount + premium) * minProfitBps / 10000
        return ((borrowAmount + premium) * minProfitBps) / 10_000;
    }

    /**
     * @dev Calculates the profit margin percentage
     * @param profit The profit amount
     * @param borrowAmount The borrowed amount
     * @return The profit margin in basis points (e.g., 50 = 0.5%)
     */
    function calculateProfitMargin(uint256 profit, uint256 borrowAmount)
        internal
        pure
        returns (uint256)
    {
        if (borrowAmount == 0) return 0;
        return (profit * 10_000) / borrowAmount;
    }
}
