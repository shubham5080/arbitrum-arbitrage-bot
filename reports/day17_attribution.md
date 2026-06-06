# Day 17: Profit Attribution Analysis Report

**Generated:** 2026-06-06

---

## Executive Summary

Day 17 builds a **Profit Attribution Engine** that decomposes every arbitrage trade into its component parts: spread, gas, flash fees, and execution costs. Rather than asking "Is this profitable?", we now ask "Where does the money go?"

**Key Metrics:**
- Spread: Market inefficiency available
- Gas Cost: Blockchain execution fee
- Flash Fee: Flash loan cost
- Execution Cost: Slippage and MEV impact
- Net Profit: What's left after all costs

---

## Methodology

For each opportunity, we calculate:

```
Spread Contribution    = (sellPrice - buyPrice) × tokenAmount     [theoretical profit]
Gas Contribution       = -gasCost                                   [blockchain cost]
Flash Fee Contribution = -flashFee                                  [flash loan cost]
Execution Contribution = grossProfit - spreadContribution           [slippage + MEV]

Net Profit = Spread + Gas + Flash + Execution
```

All contributions are expressed as percentages of trade size for easy comparison across different trade sizes.

---

## Token Attribution Analysis

*Run this analysis with:*
```bash
npx ts-node src/analytics/tokenAttribution.ts
```

### Expected Output Format:
```
TOKEN   SCANS   SPREAD%  GAS%    FLASH%  EXEC%   NET%    PROFIT
WETH    120     +0.1500  -0.0400 -0.0300 -0.0800 -0.0600 2
ARB     120     +0.0800  -0.0400 -0.0300 -0.1200 -0.1100 0
LINK    60      +0.2200  -0.0400 -0.0300 -0.0800 +0.0700 8
UNI     60      +0.0500  -0.0400 -0.0300 -0.1200 -0.1400 0
WBTC    60      +0.1800  -0.0400 -0.0300 -0.1000 -0.0900 2
```

### Interpretation Guide:

| Scenario | Spread | Execution | Net | Diagnosis |
|----------|--------|-----------|-----|-----------|
| **Market has edge** | > 0% | Low | Positive | ✅ Profitable arbitrage detected |
| **Fees kill trade** | > 0% | High | Negative | 🔄 Execution costs are bottleneck |
| **Market efficient** | ≤ 0% | N/A | Negative | 📊 Need more/better routes |
| **Can optimize** | > 0% | Moderate | Negative | 🔧 Reduce slippage & fees |

### Key Questions:
- **Which tokens have the highest spread?** → Best market inefficiencies
- **Which tokens have the lowest execution cost?** → Best liquidity pools
- **Which tokens are actually profitable?** → Production-ready candidates

---

## Route Attribution Analysis

*Run this analysis with:*
```bash
npx ts-node src/analytics/routeAttribution.ts
```

### Expected Output Format:
```
ROUTE             SCANS   SPREAD%  GAS%    FLASH%  EXEC%   NET%    PROFIT
UNISWAP -> SUSHI  60      +0.1200  -0.0400 -0.0300 -0.0900 -0.0400 1
SUSHI -> UNISWAP  60      +0.1500  -0.0400 -0.0300 -0.0800 -0.0300 2
```

### What This Tells Us:
- **Different routes have different characteristics** → Some DEX pairs better than others
- **Route ordering matters** → UNISWAP→SUSHI vs SUSHI→UNISWAP can differ
- **Liquidity varies by direction** → Buy side vs sell side liquidity asymmetry

---

## Loss Bottleneck Ranking

*Run this analysis with:*
```bash
npx ts-node src/analytics/bottlenecks.ts
```

### Expected Output Format:
```
1. Execution Slippage    ██████████████ 52%
   Avg loss: 0.0850% of trade size

2. Gas Cost              █████████ 30%
   Avg loss: 0.0400% of trade size

3. Flash Fee             ███████ 18%
   Avg loss: 0.0300% of trade size
```

### Decision Framework:

| Top Bottleneck | Action |
|----------------|--------|
| **Execution Slippage** | Reduce trade size, use smaller DEXes with better depth, or triangular routes |
| **Gas Fees** | Increase trade size to amortize, batch trades, or wait for cheaper gas |
| **Flash Fees** | Use self-funded capital, shop flash providers, or find higher-margin opportunities |

---

## Expected Outcomes (Day 17 → Day 18 Decision)

### Outcome A: Execution Costs Dominate
**Pattern:**
- Spread > 0% (market opportunity exists)
- Execution Cost > 0.05% (slippage is large)
- Net Profit < 0% (edge is eliminated by costs)

**Diagnosis:** Liquidity or route quality is the bottleneck

**Day 18 Action:** 
- Research triangular arbitrage (may have better liquidity)
- Explore other DEXes (more choices = better routes)
- Optimize execution (batch orders, split trades)

### Outcome B: Spread is Tiny
**Pattern:**
- Spread ≤ 0% (no market inefficiency)
- All costs are negative (as expected)
- Net Profit consistently negative

**Diagnosis:** Market is too efficient for simple 2-DEX arbitrage

**Day 18 Action:**
- Expand to new tokens with less trading
- Explore other Arbitrum DEXes
- Research triangular routes with multiple hops
- Consider L2 price feeds from L1

### Outcome C: Profitable Territory
**Pattern:**
- Spread > 0.10% (clear market edge)
- Execution Cost < 0.05% (efficient execution)
- Net Profit > 0% (consistently positive)

**Diagnosis:** Arbitrage opportunity is viable

**Day 18 Action:**
- Move to execution phase
- Implement position sizing strategy
- Add slippage/MEV protection
- Deploy to production on small scale

---

## Data Collection Notes

**Minimum viable data for analysis:**
- 500+ observations per token (ensures statistical significance)
- 2+ hours of data collection (captures different network conditions)
- Multiple trade sizes (100-50,000 USDC)

**Data quality checks:**
- No anomalies (e.g., >1% slippage on small trades)
- Consistent gas estimation (check against on-chain data)
- Realistic flash fees (dydx = 0.05%, Aave = 0.09%)

---

## Next Steps

1. **Collect baseline data** (1-2 hours minimum)
2. **Run all three analytics** (token, route, bottleneck)
3. **Review diagnoses** against actual market conditions
4. **Make Day 18 decision:**
   - If Outcome A: Triangular arbitrage research
   - If Outcome B: Token/DEX expansion
   - If Outcome C: Production deployment prep

---

## Appendix: Attribution Formulas

### In USDC (Absolute):
```typescript
spreadContribution = (sellPrice - buyPrice) × tokenAmount
gasContribution = -gasCost
flashContribution = -flashFee
executionContribution = grossProfit - spreadContribution
netProfit = spreadContribution + gasContribution + flashContribution + executionContribution
```

### As Percentages (Relative to Size):
```typescript
spread% = (spreadContribution / size) × 100
gas% = (gasContribution / size) × 100
flash% = (flashContribution / size) × 100
execution% = (executionContribution / size) × 100
net% = (netProfit / size) × 100
```

### Consistency Check:
```
spread% + gas% + flash% + execution% = net%
```

If this equation doesn't hold, there's a data quality issue.
