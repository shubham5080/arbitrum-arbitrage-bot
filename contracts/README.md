# Flash Loan Arbitrage Smart Contracts

This directory contains the Solidity smart contracts for the flash loan-based arbitrage execution layer.

## Overview

The Flash Loan Arbitrage system allows borrowing assets from Aave V3 via flash loans, executing validation logic, and repaying within the same transaction.

**Current Status: Phase 1 - Foundation**
- ✅ Flash loan request and callback
- ✅ Profitability validation
- ✅ Repayment handling
- ⏳ DEX integration (Day 24)
- ⏳ Real arbitrage execution (Day 25+)

## Architecture

### Core Contracts

#### `FlashLoanArbitrage.sol`
Main contract implementing flash loan functionality.

**Key Features:**
- Owner-gated flash loan initiation
- Aave V3 integration via `IFlashLoanReceiver`
- Profit validation using ProfitChecker library
- Safe withdrawal and emergency functions
- Reentrancy protection

**Flow:**
```
1. Owner calls requestFlashLoan(asset, amount)
2. Aave V3 Pool transfers assets and calls executeOperation()
3. Contract validates profitability
4. Approves repayment to Aave
5. Aave automatically pulls principal + premium
6. Contract emits FlashLoanExecuted event
7. Owner can withdraw profits via ownerWithdraw()
```

### Libraries

#### `ProfitChecker.sol`
Reusable library for profit calculations and validation.

**Functions:**
- `calculatePremium()` - Calculate flash loan fee
- `calculateRepayment()` - Calculate total repayment
- `validateProfitability()` - Check if operation is profitable
- `hasSufficientBalance()` - Verify balance for repayment
- `calculateMinProfitThreshold()` - Get minimum profit requirement
- `calculateProfitMargin()` - Calculate profit percentage

#### `AaveConfig.sol`
Centralized configuration for Aave V3 addresses on Arbitrum.

**Addresses Included:**
- Arbitrum Mainnet (42161)
  - Pool: `0x794a61358D6845594F94dc1DB02A252b5b4814aD`
  - PoolAddressesProvider: `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
  - USDC: `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5F86`
  - WETH: `0x82aF49447d8a07e3bd95bd0d56f35241523fbab1`

- Arbitrum Sepolia Testnet (421614)
  - Pool: `0x6Ae43d3271ff6888e7Fc43Fd7321a6D5022DCBd1`
  - PoolAddressesProvider: `0x1a901f5e4D316dFDDA56D34881b3Fcb69f6830d7`
  - USDC: `0x75faf514D9d7F7b38e0aad4D18ADf84b7a431d26`
  - WETH: `0xE591bf4296bF6E4ec5DaD3b59a3370207FEb0ea9`

### Interfaces

#### `IFlashLoanExecutor.sol`
Aave V3 standard interfaces for flash loan callback.

## Deployment

### Prerequisites
```bash
npm install --legacy-peer-deps
```

### Compile Contracts
```bash
npx hardhat compile
```

### Deploy to Arbitrum Sepolia (Testnet)
```bash
export ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
export PRIVATE_KEY=0x...

npx hardhat run scripts/deployFlashLoan.ts --network arbitrumSepolia
```

### Deploy to Arbitrum Mainnet
```bash
export ARBITRUM_ONE_RPC=https://arb1.arbitrum.io/rpc
export PRIVATE_KEY=0x...

npx hardhat run scripts/deployFlashLoan.ts --network arbitrumOne
```

## Testing

### Run All Tests
```bash
npx hardhat test
```

### Run Specific Test
```bash
npx hardhat test test/FlashLoanArbitrage.test.ts
```

### Generate Coverage Report
```bash
npx hardhat coverage
```

## Test Coverage

The test suite covers:

### Access Control
- ✅ Only owner can request flash loans
- ✅ Only owner can withdraw funds
- ✅ Only owner can update configuration
- ✅ Aave pool can call executeOperation

### Flash Loan Flow
- ✅ Request validation (non-zero amount, valid asset)
- ✅ Concurrent flash loan prevention
- ✅ Balance verification for repayment
- ✅ Premium calculation accuracy
- ✅ Profit validation logic

### Profitability Calculations
- ✅ Correct repayment amount calculation
- ✅ Profitable vs non-profitable operation identification
- ✅ Net profit calculation after premium
- ✅ Profit margin percentage

### Withdrawal & Emergency
- ✅ Withdraw specific amount
- ✅ Withdraw all balance
- ✅ Emergency withdrawal
- ✅ Prevent withdrawal during active flash loan
- ✅ Reentrancy protection

### Configuration
- ✅ Set minimum profit threshold
- ✅ Update Aave pool address
- ✅ Update PoolAddressesProvider address
- ✅ Input validation

## Gas Considerations

Estimated gas usage per operation:
- Flash loan request: ~150-200k gas
- Callback execution: ~80-120k gas
- Withdrawal: ~60-80k gas
- Emergency withdrawal: ~60-80k gas

Total per profitable arbitrage: **~230-300k gas** (excluding DEX interactions)

## Security Considerations

### Implemented Protections
1. **Reentrancy Guard**: `ReentrancyGuard` on critical functions
2. **Access Control**: `Ownable` for owner-gated functions
3. **Balance Checks**: Explicit balance validation before repayment
4. **Safe Token Transfer**: `SafeERC20` for all token operations
5. **Callback Validation**: Verify msg.sender is Aave pool and initiator

### Future Considerations
- Multi-signature approval for sensitive functions
- Pause/unpause mechanism for emergency stops
- Integration with governance token
- Timelock for configuration changes

## Future Integration Points

### Day 24: DEX Integration
The contract will receive swap execution hooks:
```solidity
// Future hook structure
function _executeSwaps(
    bytes calldata swapData
) internal returns (uint256 outputAmount)
```

### Day 25+: Live Arbitrage
- Route execution from TypeScript layer
- Real-time profit monitoring
- Dynamic slippage adjustment
- Multi-DEX swap coordination

## Development Notes

### Contract Dependencies
- OpenZeppelin Contracts 5.0+
- Aave V3 Core contracts
- Hardhat for development/testing

### Key Design Decisions
1. **Minimal Initial Scope**: First version only handles borrow → callback → repay
2. **Library Approach**: ProfitChecker is a library for reusability
3. **Testnet Priority**: Initially targeting Arbitrum Sepolia for safe testing
4. **Owner Control**: All critical functions require owner approval
5. **Event Logging**: Comprehensive events for off-chain monitoring

## Troubleshooting

### Compilation Errors
```bash
# Clear cache and rebuild
rm -rf artifacts cache
npx hardhat compile
```

### Deployment Issues
- Verify RPC endpoint is accessible
- Check private key is valid
- Ensure sufficient ETH for gas
- Confirm network configuration in hardhat.config.ts

### Test Failures
- Check that mock contracts are properly initialized
- Verify token addresses for your network
- Ensure sufficient account balance in test setup

## Resources

- [Aave V3 Documentation](https://docs.aave.com/developers/core-contracts/pool)
- [Arbitrum Documentation](https://docs.arbitrum.io/)
- [OpenZeppelin Docs](https://docs.openzeppelin.com/contracts/5.x/)
- [Hardhat Docs](https://hardhat.org/docs)

## Status & Next Steps

✅ **Completed (Day 23)**
- Smart contract foundation
- Flash loan request/callback
- Profit validation
- Basic testing structure
- Deployment script

⏳ **Next (Day 24)**
- DEX swap integration
- Real route execution
- Live testing on testnet

⏳ **Future**
- Multi-DEX coordination
- Advanced profit optimization
- Production deployment
