// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ICamelotRouter} from "./DEXInterfaces.sol";
import {SwapHelpers} from "../libraries/SwapHelpers.sol";

/**
 * @title CamelotExecutor
 * @dev Executes swaps on Camelot
 */
library CamelotExecutor {
    event CamelotSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /**
     * @notice Executes a swap on Camelot with output verification
     */
    function executeSwap(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        require(router != address(0), "CamelotExecutor: Invalid router");
        require(amountIn > 0, "CamelotExecutor: Invalid amount");
        require(tokenIn != tokenOut, "CamelotExecutor: Same token");

        ICamelotRouter camelotRouter = ICamelotRouter(router);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory quoted = camelotRouter.getAmountsOut(amountIn, path);
        require(quoted.length > 1, "CamelotExecutor: Quote failed");
        require(quoted[quoted.length - 1] >= minAmountOut, "CamelotExecutor: Quote below minimum");

        SwapHelpers.approveIfNeeded(tokenIn, router, amountIn);

        try
            camelotRouter.swapExactTokensForTokens(
                amountIn,
                minAmountOut,
                path,
                address(this),
                block.timestamp + 300
            )
        returns (uint256[] memory amounts) {
            amountOut = amounts[amounts.length - 1];
        } catch {
            revert("CamelotExecutor: Swap failed");
        }

        require(amountOut >= minAmountOut, "CamelotExecutor: Slippage exceeded");

        emit CamelotSwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }
}
