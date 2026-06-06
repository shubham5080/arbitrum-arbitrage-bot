# Day 16: Execution Quality Diagnostics

## What Changed

### New Opportunity Schema Fields

| Field | Meaning | Example |
|-------|---------|---------|
| `buyPrice` | USDC paid per token at buy DEX | 12.51 |
| `sellPrice` | USDC received per token at sell DEX | 12.53 |
| `spreadPercent` | Market spread: (sellPrice - buyPrice) / buyPrice × 100 | 0.16% |
| `slippageImpact` | Execution costs as % of gross profit | 250% |

### Why This Matters

**Before Day 16:**
```
Question: Is arbitrage profitable?
Answer: No, net_profit = -0.11 USDC
```

**After Day 16:**
```
Question: Why is arbitrage not profitable?

LINK:
  Spread: 0.20% (positive ✓)
  Slippage: 400% (ouch!)
  Net Profit: -0.03 USDC
  
→ Conclusion: Gas + flash fees kill the trade
```

## How to Use

### Check Execution Quality

```bash
npx ts-node src/audit/executionQuality.ts
```

**Output Example:**
```
Token | Scans | Spread% | Avg Slippage | Avg Net Profit
WETH  | 120   | 0.15    | 250          | -0.05
ARB   | 120   | 0.08    | 450          | -0.12
LINK  | 60    | 0.22    | 300          | -0.08
```

### Interpretation Guide

| Scenario | Spread | Slippage | Net Profit | Action |
|----------|--------|----------|-----------|--------|
| Market has edge | > 0% | Low (< 100%) | Positive | ✅ Production ready |
| Fees kill trade | > 0% | High (> 200%) | Negative | 🔄 Optimize gas/fees |
| Efficient market | ≤ 0% | N/A | Negative | 📊 Expand token set |
| Better to triangular | Varies | High | Negative | 🔺 Add 3-hop routes |

## Database Queries

### Token Breakdown (Spread × Slippage × Profit)

```sql
SELECT
  token,
  COUNT(*) as scans,
  ROUND(AVG(spread_percent), 4) as avg_spread,
  ROUND(AVG(slippage_impact), 2) as avg_slippage,
  ROUND(AVG(net_profit), 2) as avg_net_profit
FROM opportunities
GROUP BY token
ORDER BY avg_net_profit DESC;
```

### Route Quality Comparison

```sql
SELECT
  route,
  COUNT(*) as scans,
  ROUND(AVG(spread_percent), 4) as avg_spread,
  ROUND(AVG(net_profit), 2) as avg_net_profit
FROM opportunities
GROUP BY route
ORDER BY avg_net_profit DESC;
```

## What to Collect

After several hours of data with expanded tokens (LINK, UNI, WBTC):

1. **Spread by token** → Is market edge there?
2. **Slippage by token** → How much do fees eat?
3. **Net profit trend** → Is it improving with more data?
4. **Opportunity lifetime** → Are windows getting longer?

## Next Decision Point

- **If spread > 0% and net profit < 0%:** Gas/fees are the bottleneck → Optimize execution or look at triangular
- **If spread ≤ 0%:** Market is efficient → Expand to more tokens or explore triangular routes
- **If spread > 0% and net profit > 0%:** 🚀 Deploy to production with proper risk management

## Code Location

- Opportunity type: `src/types/opportunity.ts`
- Database schema: `src/database/database.ts`
- Scanner logic: `src/scanner/scanMarket.ts`
- Breakdown query: `src/database/database.ts` → `getTokenBreakdown()`
- Analysis tool: `src/audit/executionQuality.ts`
