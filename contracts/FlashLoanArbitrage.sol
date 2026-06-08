// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFlashLoanReceiver, IAavePool} from "./interfaces/IFlashLoanExecutor.sol";
import {AaveConfig} from "./libraries/AaveConfig.sol";
import {DexConfig} from "./libraries/DexConfig.sol";
import {ProfitChecker} from "./libraries/ProfitChecker.sol";
import {SwapHelpers} from "./libraries/SwapHelpers.sol";
import {UniswapExecutor} from "./dex/UniswapExecutor.sol";
import {SushiExecutor} from "./dex/SushiExecutor.sol";
import {CamelotExecutor} from "./dex/CamelotExecutor.sol";
import {ArbitrageRoute} from "./types/ExecutionTypes.sol";

/**
 * @title FlashLoanArbitrage
 * @dev Flash loan arbitrage: Borrow → Swap 1 → Swap 2 → Repay → Profit
 */
contract FlashLoanArbitrage is IFlashLoanReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event FlashLoanRequested(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 timestamp
    );

    event FlashLoanExecuted(
        address indexed asset,
        uint256 borrowAmount,
        uint256 premium,
        uint256 balance,
        bool profitable,
        uint256 profit,
        uint256 timestamp
    );

    event FlashLoanFailed(
        address indexed asset,
        uint256 amount,
        string reason,
        uint256 timestamp
    );

    event Withdrawal(address indexed asset, uint256 amount, address indexed to, uint256 timestamp);

    event EmergencyWithdrawal(address indexed asset, uint256 amount, uint256 timestamp);

    event ArbitrageStarted(
        uint256 indexed routeId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 timestamp
    );

    event SwapExecuted(
        uint256 indexed routeId,
        address indexed dex,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );

    event ArbitrageCompleted(
        uint256 indexed routeId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 finalBalance,
        uint256 profit,
        uint256 gasUsed,
        uint256 timestamp
    );

    event ProfitRealized(
        uint256 indexed routeId,
        address indexed token,
        uint256 profit,
        uint256 gasUsed,
        uint256 timestamp
    );

    event ExecutionFailed(
        uint256 indexed routeId,
        address indexed tokenIn,
        string reason,
        uint256 timestamp
    );

    bool public useMainnet;
    address public poolAddressesProvider;
    address public aavePool;
    address public usdcToken;
    address public wethToken;
    address public uniswapRouter;
    address public sushiRouter;
    address public camelotRouter;

    bool public isFlashLoanInProgress;
    address public currentFlashLoanAsset;
    uint256 public lastFlashLoanAmount;
    uint256 public lastFlashLoanPremium;

    uint256 public minProfitBps = 10;
    uint256 public maxSlippageBps = 50;
    uint256 public gasBuffer;

    ArbitrageRoute public currentRoute;
    uint256 public currentRouteId;
    bool public routeInExecution;

    uint256 public totalExecutions;
    uint256 public totalProfit;

    constructor(bool _useMainnet) Ownable(msg.sender) {
        useMainnet = _useMainnet;
        (poolAddressesProvider, aavePool, usdcToken, wethToken) = AaveConfig.getConfig(_useMainnet);
        (uniswapRouter, sushiRouter, camelotRouter) = DexConfig.getDexRouters(_useMainnet);
        isFlashLoanInProgress = false;
    }

    /**
     * @dev Borrow only (no swaps) — legacy path for simple flash loan tests
     */
    function requestFlashLoan(address asset, uint256 amount) external onlyOwner nonReentrant {
        _startFlashLoan(asset, amount, false);
    }

    /**
     * @dev Borrow and execute a two-leg arbitrage route in one transaction
     */
    function requestFlashLoanWithRoute(address asset, ArbitrageRoute calldata route)
        external
        onlyOwner
        nonReentrant
    {
        _validateRoute(asset, route);
        currentRoute = route;
        currentRouteId = totalExecutions + 1;
        routeInExecution = true;
        _startFlashLoan(asset, route.amountIn, true);
    }

    function _startFlashLoan(address asset, uint256 amount, bool withRoute) internal {
        require(asset != address(0), "Invalid asset address");
        require(amount > 0, "Amount must be greater than 0");
        require(!isFlashLoanInProgress, "Flash loan already in progress");
        if (withRoute) {
            require(routeInExecution, "Route not configured");
        } else {
            routeInExecution = false;
        }

        isFlashLoanInProgress = true;
        currentFlashLoanAsset = asset;

        IAavePool(aavePool).flashLoan(
            address(this),
            asset,
            amount,
            "",
            address(this),
            0
        );
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata
    ) external override returns (bool) {
        require(msg.sender == aavePool, "Unauthorized: must be called by Aave Pool");
        require(isFlashLoanInProgress, "Flash loan not in progress");
        require(asset == currentFlashLoanAsset, "Asset mismatch");
        require(initiator == address(this), "Initiator mismatch");

        uint256 gasStart = gasleft();
        lastFlashLoanAmount = amount;
        lastFlashLoanPremium = premium;

        if (routeInExecution && currentRoute.amountIn == amount) {
            _executeArbitrageRoute(asset, amount, premium, gasStart);
        }

        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 repaymentRequired = amount + premium + gasBuffer;
        require(finalBalance > repaymentRequired, "Insufficient balance for repayment");

        IERC20(asset).forceApprove(aavePool, amount + premium);

        uint256 profit = finalBalance - amount - premium;
        uint256 gasUsed = gasStart - gasleft();

        emit FlashLoanExecuted(
            asset,
            amount,
            premium,
            finalBalance,
            profit > 0,
            profit,
            block.timestamp
        );

        isFlashLoanInProgress = false;
        routeInExecution = false;

        return true;
    }

    function _executeArbitrageRoute(
        address borrowAsset,
        uint256 amount,
        uint256 premium,
        uint256 gasStart
    ) internal {
        uint256 routeId = currentRouteId;
        ArbitrageRoute memory route = currentRoute;

        emit ArbitrageStarted(
            routeId,
            route.tokenIn,
            route.tokenOut,
            route.amountIn,
            block.timestamp
        );

        uint256 buyAmount = _executeSwap(
            route.buyDex,
            route.tokenIn,
            route.tokenOut,
            route.amountIn,
            route.minAmountAfterBuy,
            route.buyFee
        );

        emit SwapExecuted(
            routeId,
            route.buyDex,
            route.tokenIn,
            route.tokenOut,
            route.amountIn,
            buyAmount,
            block.timestamp
        );

        uint256 sellAmount = _executeSwap(
            route.sellDex,
            route.tokenOut,
            route.tokenIn,
            buyAmount,
            route.minAmountAfterSell,
            route.sellFee
        );

        emit SwapExecuted(
            routeId,
            route.sellDex,
            route.tokenOut,
            route.tokenIn,
            buyAmount,
            sellAmount,
            block.timestamp
        );

        uint256 finalBalance = IERC20(borrowAsset).balanceOf(address(this));
        uint256 repaymentFloor = amount + premium + gasBuffer;

        if (finalBalance <= repaymentFloor) {
            emit ExecutionFailed(routeId, route.tokenIn, "Insufficient balance after swaps", block.timestamp);
            revert("Insufficient balance after swaps");
        }

        uint256 profit = finalBalance - repaymentFloor;
        if (profit < route.minProfit) {
            emit ExecutionFailed(routeId, route.tokenIn, "Below minimum profit", block.timestamp);
            revert("Below minimum profit");
        }

        totalProfit += profit;
        totalExecutions++;

        uint256 gasUsed = gasStart - gasleft();

        emit ArbitrageCompleted(
            routeId,
            route.tokenIn,
            route.tokenOut,
            route.amountIn,
            finalBalance,
            profit,
            gasUsed,
            block.timestamp
        );

        emit ProfitRealized(routeId, route.tokenIn, profit, gasUsed, block.timestamp);
    }

    function _executeSwap(
        address dexRouter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        require(tokenIn != tokenOut, "Same token swap not allowed");
        require(amountIn > 0, "Invalid swap amount");
        require(minAmountOut > 0, "Invalid min output");

        if (dexRouter == uniswapRouter) {
            amountOut = UniswapExecutor.executeUniswapSwap(
                dexRouter,
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                fee
            );
        } else if (dexRouter == sushiRouter) {
            amountOut = SushiExecutor.executeSwap(
                dexRouter,
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut
            );
        } else if (dexRouter == camelotRouter) {
            amountOut = CamelotExecutor.executeSwap(
                dexRouter,
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut
            );
        } else {
            emit ExecutionFailed(currentRouteId, tokenIn, "Unknown DEX router", block.timestamp);
            revert("Unknown DEX router");
        }

        require(amountOut >= minAmountOut, "Slippage too high");
    }

    function _validateRoute(address asset, ArbitrageRoute calldata route) internal view {
        require(route.tokenIn == asset, "tokenIn must match borrowed asset");
        require(route.tokenOut != address(0), "Invalid tokenOut");
        require(route.tokenIn != route.tokenOut, "Tokens must differ");
        require(route.amountIn > 0, "Invalid amountIn");
        require(route.minAmountAfterBuy > 0, "Invalid buy min output");
        require(route.minAmountAfterSell > 0, "Invalid sell min output");
        require(_isKnownRouter(route.buyDex), "Unknown buy DEX");
        require(_isKnownRouter(route.sellDex), "Unknown sell DEX");

        if (route.buyDex == uniswapRouter) {
            require(route.buyFee > 0, "Uniswap buy fee required");
        }
        if (route.sellDex == uniswapRouter) {
            require(route.sellFee > 0, "Uniswap sell fee required");
        }
    }

    function _isKnownRouter(address router) internal view returns (bool) {
        return router == uniswapRouter || router == sushiRouter || router == camelotRouter;
    }

    function ownerWithdraw(address asset, uint256 amount) external onlyOwner nonReentrant {
        require(asset != address(0), "Invalid asset address");
        require(!isFlashLoanInProgress, "Cannot withdraw during flash loan");

        IERC20 token = IERC20(asset);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");

        uint256 withdrawAmount = amount == 0 ? balance : amount;
        require(withdrawAmount <= balance, "Insufficient balance");

        token.safeTransfer(msg.sender, withdrawAmount);
        emit Withdrawal(asset, withdrawAmount, msg.sender, block.timestamp);
    }

    function emergencyWithdraw(address asset) external onlyOwner {
        require(asset != address(0), "Invalid asset address");
        require(!isFlashLoanInProgress, "Cannot withdraw during flash loan");

        IERC20 token = IERC20(asset);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");

        token.safeTransfer(msg.sender, balance);
        emit EmergencyWithdrawal(asset, balance, block.timestamp);
    }

    function setMinProfitBps(uint256 bps) external onlyOwner {
        require(bps > 0, "Minimum profit must be greater than 0");
        require(bps <= 10000, "Basis points cannot exceed 10000");
        minProfitBps = bps;
    }

    function setMaxSlippageBps(uint256 bps) external onlyOwner {
        require(bps <= 10000, "Basis points cannot exceed 10000");
        maxSlippageBps = bps;
    }

    function setGasBuffer(uint256 buffer) external onlyOwner {
        gasBuffer = buffer;
    }

    function setAavePool(address newPoolAddress) external onlyOwner {
        require(newPoolAddress != address(0), "Invalid pool address");
        aavePool = newPoolAddress;
    }

    function setPoolAddressesProvider(address newProvider) external onlyOwner {
        require(newProvider != address(0), "Invalid provider address");
        poolAddressesProvider = newProvider;
    }

    function setDexRouters(address uniswap, address sushi, address camelot) external onlyOwner {
        require(uniswap != address(0) && sushi != address(0) && camelot != address(0), "Invalid router");
        uniswapRouter = uniswap;
        sushiRouter = sushi;
        camelotRouter = camelot;
    }

    function getBalance(address asset) external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function getFlashLoanPremium() external view returns (uint128) {
        return AaveConfig.FLASHLOAN_PREMIUM;
    }

    function getFlashLoanStatus()
        external
        view
        returns (bool inProgress, address asset, uint256 amount)
    {
        return (isFlashLoanInProgress, currentFlashLoanAsset, lastFlashLoanAmount);
    }

    function calculateRepayment(uint256 borrowAmount) external view returns (uint256) {
        uint256 premium = ProfitChecker.calculatePremium(borrowAmount, AaveConfig.FLASHLOAN_PREMIUM);
        return ProfitChecker.calculateRepayment(borrowAmount, premium);
    }

    function isProfitable(uint256 borrowAmount, uint256 availableProfit)
        external
        view
        returns (bool, uint256)
    {
        uint256 premium = ProfitChecker.calculatePremium(borrowAmount, AaveConfig.FLASHLOAN_PREMIUM);
        if (availableProfit > premium) {
            return (true, availableProfit - premium);
        }
        return (false, 0);
    }

    receive() external payable {}
}
