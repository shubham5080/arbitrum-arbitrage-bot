// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISushiRouter} from "./DEXInterfaces.sol";
import {SwapHelpers} from "../libraries/SwapHelpers.sol";

/**
 * @title SushiExecutor
 * @dev Executes swaps on Sushi (V2-style router)
 */
library SushiExecutor {
    event SushiSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /**
     * @notice Executes a swap on Sushi with route construction and min-output validation
     */
    function executeSwap(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        require(router != address(0), "SushiExecutor: Invalid router");
        require(amountIn > 0, "SushiExecutor: Invalid amount");
        require(tokenIn != tokenOut, "SushiExecutor: Same token");

        ISushiRouter sushiRouter = ISushiRouter(router);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory quoted = sushiRouter.getAmountsOut(amountIn, path);
        require(quoted.length > 1, "SushiExecutor: Quote failed");
        require(quoted[quoted.length - 1] >= minAmountOut, "SushiExecutor: Quote below minimum");

        SwapHelpers.approveIfNeeded(tokenIn, router, amountIn);

        uint256[] memory amounts = sushiRouter.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );

        amountOut = amounts[amounts.length - 1];
        require(amountOut >= minAmountOut, "SushiExecutor: Slippage exceeded");

        emit SushiSwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }
}
