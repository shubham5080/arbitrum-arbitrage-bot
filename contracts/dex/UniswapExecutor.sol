// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV3Router} from "./DEXInterfaces.sol";
import {SwapHelpers} from "../libraries/SwapHelpers.sol";

/**
 * @title UniswapExecutor
 * @dev Executes swaps on Uniswap V3 via ISwapRouter.exactInputSingle
 */
library UniswapExecutor {
    event UniswapSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 fee
    );

    /**
     * @notice Executes a swap on Uniswap V3
     */
    function executeUniswapSwap(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        require(router != address(0), "UniswapExecutor: Invalid router");
        require(amountIn > 0, "UniswapExecutor: Invalid amount");
        require(tokenIn != tokenOut, "UniswapExecutor: Same token");
        require(fee > 0, "UniswapExecutor: Invalid fee tier");

        SwapHelpers.approveIfNeeded(tokenIn, router, amountIn);

        IUniswapV3Router swapRouter = IUniswapV3Router(router);

        amountOut = swapRouter.exactInputSingle(
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        require(amountOut >= minAmountOut, "UniswapExecutor: Slippage exceeded");

        emit UniswapSwapExecuted(tokenIn, tokenOut, amountIn, amountOut, fee);
    }
}
