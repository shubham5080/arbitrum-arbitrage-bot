// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Router} from "../dex/DEXInterfaces.sol";

contract MockUniswapRouter is IUniswapV3Router {
    uint256 public rateBps = 10_000;

    function setRateBps(uint256 newRateBps) external {
        require(newRateBps > 0, "Invalid rate");
        rateBps = newRateBps;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        amountOut = (params.amountIn * rateBps) / 10_000;
        require(amountOut >= params.amountOutMinimum, "Slippage");

        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = (amountIn * rateBps) / 10_000;
    }
}
