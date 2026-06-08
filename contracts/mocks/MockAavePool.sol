// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFlashLoanReceiver} from "../interfaces/IFlashLoanExecutor.sol";

contract MockAavePool {
    uint128 public constant FLASHLOAN_PREMIUM_TOTAL = 5;

    function flashLoan(
        address receiver,
        address token,
        uint256 amount,
        bytes calldata userData,
        address onBehalfOf,
        uint16
    ) external {
        IERC20 asset = IERC20(token);
        asset.transfer(receiver, amount);

        uint256 premium = (amount * FLASHLOAN_PREMIUM_TOTAL) / 10_000;
        bool success = IFlashLoanReceiver(receiver).executeOperation(
            token,
            amount,
            premium,
            onBehalfOf,
            userData
        );
        require(success, "Flash loan callback failed");

        asset.transferFrom(receiver, address(this), amount + premium);
    }
}
