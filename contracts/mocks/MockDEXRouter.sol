// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Simple 1:1 mock router for local flash-loan route tests
 */
contract MockDEXRouter {
    uint256 public rateBps = 10_000;

    function setRateBps(uint256 newRateBps) external {
        require(newRateBps > 0, "Invalid rate");
        rateBps = newRateBps;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        uint256 amountOut = (amountIn * rateBps) / 10_000;
        require(amountOut >= amountOutMin, "Slippage");

        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).transfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = amountOut;
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
