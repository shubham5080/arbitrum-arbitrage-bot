# Day 14: Reality Validation - Quick Reference

## TL;DR

Run monitor for 4-24 hours, then generate report to answer:
- Are there profitable opportunities?
- How often?
- How long do they last?
- Can they be executed?

## Commands

```bash
# Start collecting data (leave running for 4-24 hours)
npx ts-node src/monitor/liveMonitor.ts

# Generate analysis report (in separate terminal, anytime)
npx ts-node src/tools.ts generate-report

# Output: docs/research_report_day14.md
```

## Report Sections

| Section | What It Shows | Why It Matters |
|---------|---------------|---|
| **Statistics** | Total scans, % profitable, profit ranges | Determines if market has opportunities |
| **Token Ranking** | Best/worst performing tokens | Focus execution on winners |
| **Route Ranking** | Best DEX pairs (UNI→SUSHI, etc) | Identify best trading pairs |
| **Size Analysis** | Which USDC amounts work best | Optimize trade sizing |
| **Lifetime** | How long opportunities persist | Determines if execution is feasible |
| **Conclusions** | Auto-generated next steps | What to do based on data |

## The Critical Metric: Opportunity Lifetime

**This determines if project is viable:**

- ⏱️ < 1 second → Infeasible (need microsecond execution)
- ⏱️ 1-5 seconds → Very challenging (tight timing required)
- ⏱️ 5-30 seconds → Doable (normal execution sufficient)  
- ⏱️ 30+ seconds → Easy (plenty of time)

## Report Interpretation

### Example Report Data:
```
Scans: 14,400 (4 hours)
Profitable: 287 (1.99%)
Total Profit: $145.67
Avg Lifetime: 12.5 seconds
```

**What this means:**
- ✅ Opportunities exist (1.99% > 0%)
- ✅ Reasonable frequency (1 in 50 scans)
- ✅ Good lifetime (12.5 seconds >> 5 seconds needed)
- ✅ **Conclusion: Viable for execution**

## Timeline

| Hours | Scans | Status |
|-------|-------|--------|
| 0.5h | 360 | Preliminary data |
| 1h | 720 | First dashboard prints |
| 4h | 2,880 | Minimum for report |
| 12h | 8,640 | Good dataset |
| 24h | 17,280 | Excellent dataset |

## After Report Generation

The report file auto-assesses and recommends:

```markdown
## Conclusions & Recommendations

### Opportunity Frequency
[✅ or ❌ assessment]
- Profitability: 1.99%
- Status: Good data for execution
- Action: Proceed with implementation

### Opportunity Lifetime  
[✅ or ❌ assessment]
- Average: 12.5 seconds
- Status: Sufficient time for execution
- Action: Standard execution sufficient

### Next Steps
1. Build execution engine (Day 15-16)
2. Implement transaction submission
3. Add gas optimization
4. Scale to production
```

## Files Used

| File | Purpose |
|------|---------|
| `src/monitor/liveMonitor.ts` | Runs monitor, saves data |
| `src/analytics/reportGenerator.ts` | Analyzes data, generates report |
| `src/tools.ts` | CLI with `generate-report` command |
| `docs/research_report_day14.md` | Output report (auto-generated) |

## Pro Tips

1. **Run During Active Hours** - More opportunities during peak trading
2. **Minimum 4 Hours** - Need enough data for statistical significance
3. **Don't Interrupt** - Each 5-second scan adds valuable data point
4. **Save Important Reports** - Copy to backup before re-running

```bash
# Backup a report before generating a new one
cp docs/research_report_day14.md docs/research_report_day14_backup.md
```

5. **Manual Analysis While Running**:
```bash
# Check real-time stats in another terminal
npx ts-node src/tools.ts stats-1h
npx ts-node src/tools.ts stats-24h
npx ts-node src/tools.ts count-1h
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No opportunities found | Let monitor run longer (need 5+ min minimum) |
| Monitor crashes | Check `.env` RPC_URL is correct |
| Report not created | Ensure `docs/` directory exists |
| Very low profitability | Add more tokens/DEXes before reporting |

---

**See [DAY14_EXECUTION_GUIDE.md](./DAY14_EXECUTION_GUIDE.md) for complete instructions**

**See [DAY14_OVERVIEW.md](./DAY14_OVERVIEW.md) for detailed explanation**
