# Day 14: Reality Validation - Execution Guide

## Objective

Run the arbitrage monitor continuously for **4-12 hours minimum** (ideally 24 hours) to collect empirical evidence about:
- Opportunity frequency
- Profitability rates
- Token performance
- DEX pair effectiveness
- Trade size optimization
- Opportunity lifetime (critical for execution feasibility)

## Quick Start

### Step 1: Start the Monitor

```bash
# Terminal 1 - Start collecting data
npx ts-node src/monitor/liveMonitor.ts
```

This will:
- Initialize SQLite database
- Scan the market every 5 seconds
- Save all opportunities (profitable or not)
- Print live table of top opportunities
- Print hourly dashboard every 720 scans (≈1 hour)

**Output will look like:**
```
2026-06-06T14:23:45.123Z

Token    Route               Size   Net Profit   Score
------   ----------          ----   ----------   -----
LINK     UNI -> CAMELOT      500    2.15        0.0043
ARB      SUSHI -> UNISWAP    1000   1.87        0.0019
...
```

### Step 2: Let It Run

- **Minimum:** 4 hours (14,400 scans at 5-second intervals)
- **Recommended:** 12 hours (43,200 scans)
- **Ideal:** 24 hours (86,400 scans) for comprehensive data

**Duration Map:**
- 5 seconds = 1 scan
- 5 minutes = 60 scans
- 1 hour = 720 scans
- 24 hours = 17,280 scans

### Step 3: Generate Report

**In another terminal (while monitor is running or after it finishes):**

```bash
# Terminal 2 - Generate analysis report
npx ts-node src/tools.ts generate-report
```

This will:
1. Query all opportunities in database
2. Calculate comprehensive statistics
3. Generate markdown report: `docs/research_report_day14.md`
4. Print summary to console

**Console output:**
```
Generating Day 14 research report...

📊 Report successfully generated!

Summary:
- Total Scans: 14400
- Profitable: 287 (1.99%)
- Total Profit: $145.67 USDC
- Duration: 4.0 hours
- Best Token: LINK
- Best Route: UNI -> CAMELOT
```

## Manual Analysis (Optional)

While monitor is running, check real-time stats:

```bash
# Last hour statistics
npx ts-node src/tools.ts stats-1h

# Last 24 hours
npx ts-node src/tools.ts stats-24h

# Opportunity count
npx ts-node src/tools.ts count-1h

# Track specific opportunity lifetime
npx ts-node src/tools.ts lifetime LINK "UNI -> SUSHI" 500
```

## Generated Report Structure

After running `generate-report`, you'll get `docs/research_report_day14.md` with:

### 1. Overview Section
- Exact timestamps of data collection start/end
- Duration in hours
- Data collection timeframe

### 2. Key Statistics
- Total scans executed
- Profitable scans count
- Profitability rate (%)
- Total profit in period
- Average profit per scan
- Max and min profit values

### 3. Token Ranking
Top 10 tokens by total profit:
```
| Rank | Token | Scans | Profitable | Rate  | Total Profit | Avg    | Max   |
|------|-------|-------|-----------|-------|--------------|--------|-------|
| 1    | LINK  | 145   | 23        | 15.9% | $87.56       | $0.60  | $4.12 |
| 2    | ARB   | 87    | 12        | 13.8% | $34.23       | $0.39  | $2.15 |
```

### 4. Route Ranking
Best DEX pair combinations:
```
| Rank | Route              | Scans | Profitable | Rate  | Total Profit | Avg   | Max   |
|------|------------------|-------|-----------|-------|--------------|-------|-------|
| 1    | UNI -> CAMELOT   | 89    | 18        | 20.2% | $56.78       | $0.64 | $3.87 |
| 2    | SUSHI -> CAMELOT | 67    | 10        | 14.9% | $32.12       | $0.48 | $2.34 |
```

### 5. Trade Size Analysis
Performance by USDC input amount:
```
| Size  | Scans | Profitable | Rate  | Total Profit | Avg Profit |
|-------|-------|-----------|-------|--------------|-----------|
| $100  | 45    | 7         | 15.6% | $12.34       | $0.27     |
| $250  | 50    | 9         | 18.0% | $21.56       | $0.43     |
| $500  | 48    | 12        | 25.0% | $34.78       | $0.73     |
| $1000 | 40    | 8         | 20.0% | $29.45       | $0.74     |
```

### 6. DEX Performance
How each DEX performs:
```
| DEX    | Usage | Profitable | Rate  | Total Profit | Avg Profit |
|--------|-------|-----------|-------|--------------|-----------|
| UNISWAP| 234   | 35        | 15.0% | $89.23       | $0.38     |
| SUSHI  | 189   | 28        | 14.8% | $67.45       | $0.36     |
| CAMELOT| 156   | 29        | 18.6% | $71.23       | $0.46     |
```

### 7. Opportunity Lifetime (Most Important!)
How long opportunities persist before closing:
```
| Token | Route              | Size | Occurrences | Avg Duration | Instances |
|-------|------------------|------|-------------|--------------|-----------|
| LINK  | UNI -> CAMELOT   | 500  | 87          | 12.5s        | 3         |
| ARB   | SUSHI -> CAMELOT | 1000 | 65          | 8.3s         | 2         |
| LINK  | UNI -> SUSHI     | 250  | 45          | 5.1s         | 4         |
```

### 8. Conclusions & Recommendations

Auto-generated assessment based on data:

**Opportunity Frequency:** 
- ❌ Almost no profitable opportunities
- ⚠️ Low profitability rate
- ✅ Moderate profitability rate
- ✅✅ High profitability rate

**Opportunity Lifetime:**
- ⚠️⚠️ Very short windows (<1 second) - Likely impossible for retail
- ⚠️ Short windows - Requires fast execution
- ✅ Moderate windows - Good for production
- ✅✅ Long windows - Excellent conditions

**Recommended Next Steps:**
- Add more tokens/DEXes if profitability is low
- Optimize execution if lifetime is short
- Build execution engine if data looks good

## Interpreting Results

### Scenario A: Low Profitability
```
- Profitable: <1%
- Conclusion: Need more DEXes or tokens
- Action: Expand scanner coverage before building execution
```

### Scenario B: Good Frequency, Very Short Lifetime
```
- Profitable: 3-5%
- Avg Lifetime: <2 seconds
- Conclusion: Opportunities exist but execution is tight
- Action: Need optimized execution infrastructure
```

### Scenario C: Good Frequency, Reasonable Lifetime
```
- Profitable: 2-5%
- Avg Lifetime: 10-30 seconds
- Conclusion: Ready for execution implementation
- Action: Build transaction submission logic
```

### Scenario D: Excellent Data
```
- Profitable: 5%+
- Avg Lifetime: 30+ seconds
- Conclusion: Strong foundation for production
- Action: Scale to production trading
```

## Important Notes

1. **Monitor Runs Continuously**: It will print live updates and won't stop unless you:
   - Press `Ctrl+C` (graceful shutdown)
   - Close terminal
   - It will properly close the database on exit

2. **Database Accumulates Data**: All opportunities are stored in `./arbitrage.db`
   - Useful for long-term analysis
   - Can delete old data with: `npx ts-node src/tools.ts cleanup-7d`

3. **Report Overwrites**: Each time you run `generate-report`, it overwrites `docs/research_report_day14.md`
   - Save important reports to different names if needed
   - Example: `cp docs/research_report_day14.md docs/research_report_day14_backup.md`

4. **Expected Output Size**:
   - 4 hours ≈ 14,400 opportunities ≈ 200KB database
   - 24 hours ≈ 86,400 opportunities ≈ 1MB database

## Troubleshooting

### "No opportunities found in database"
**Solution:** Monitor hasn't collected data yet. Let it run for at least 5 minutes before generating report.

### Monitor crashes
**Solution:** Check if RPC_URL is set in `.env` and Arbitrum node is accessible

### Report file not created
**Solution:** Check that `docs/` directory exists:
```bash
mkdir -p docs
```

## After Report Generation

The markdown file `docs/research_report_day14.md` can be:
- Viewed in any text editor
- Displayed on GitHub
- Included in project documentation
- Used to justify execution architecture decisions

---

## Success Checklist

- [ ] Monitor running continuously for at least 4 hours
- [ ] Monitor saving opportunities to database (check console output)
- [ ] Generated report shows statistics
- [ ] Reviewed token rankings
- [ ] Reviewed route rankings  
- [ ] Analyzed trade size performance
- [ ] Checked opportunity lifetime data
- [ ] Read recommendations section
- [ ] Determined if execution is feasible
- [ ] Decided next steps based on findings

Good luck with data collection! The insights from Day 14 will inform all future decisions.
