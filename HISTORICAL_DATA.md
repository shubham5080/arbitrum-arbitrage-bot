# Day 13: Historical Data Collection System

## Overview

Built a complete historical data collection and analytics system for tracking arbitrage opportunities over time, enabling analysis of patterns, frequency, and profitability metrics.

## Features Implemented

### 1. SQLite Database (`src/database/database.ts`)
- **Schema**: Stores all opportunities with timestamp, token, route, profit metrics, and liquidity info
- **Automatic Indexing**: Timestamp index for fast queries
- **CRUD Operations**: Save, retrieve, and query opportunities
- **Retention**: Functions to clear old data (auto-cleanup after 7+ days)

**Available Functions:**
- `initializeDatabase()` - Create schema on startup
- `saveOpportunity(opportunity)` - Save every opportunity (profitable or not)
- `getOpportunitiesSince(secondsAgo)` - Query recent opportunities
- `getOpportunitiesForToken(token)` - Filter by token
- `getOpportunitiesForRoute(route)` - Filter by route
- `getOpportunitiesForDex(dex)` - Filter by DEX
- `clearOldOpportunities(daysOld)` - Auto-cleanup

### 2. Analytics Engine (`src/analytics/stats.ts`)
Comprehensive statistics calculations across multiple dimensions:

**Available Metrics:**
- **Basic Stats**: Total scans, count of profitable vs unprofitable, percentage
- **Profit Analysis**: Average, maximum, minimum net profit
- **Best Performers**: Best token, best route, worst route
- **Top Lists**: Top 5 tokens, routes, and DEXes by profit
- **Size Analysis**: Trade size performance breakdown

**Available Functions:**
- `getStatsSince(secondsAgo)` - Stats for any time window
- `getStats1Hour()` - Last hour statistics
- `getStats24Hours()` - Last 24 hours statistics
- `getStatsAllTime()` - All-time statistics
- `getOpportunityLifetime(token, route, size)` - Track how long opportunities persist

### 3. Opportunity Lifetime Tracking
Answers the question: **"How long do opportunities exist?"**

Tracks:
- Number of occurrences of identical opportunities
- How many instances (separated by >30s gaps)
- Average duration per instance

Example: If LINK Uni→Camelot at $100 appears 15 times over 45 seconds:
- `count: 15` scans found it
- `instances: 1` continuous window
- `avgDuration: 45` seconds it persisted

### 4. Dashboard Output (`src/analytics/dashboard.ts`)
Hourly summary report with:
```
==================================================
ARBITRAGE OPPORTUNITY REPORT
==================================================

Scans: 720
Profitable: 23/720 (3.19%)

Max Profit: $4.12 USDC
Avg Profit: $0.38 USDC
Min Profit: -$0.15 USDC

Best Token: LINK
Best Route: UNI -> CAMELOT
Worst Route: SUSHI -> CAMELOT

Top Tokens:
  1. LINK: $87.56 USDC (145 scans)
  2. ARB: $34.23 USDC (87 scans)
  ...

Top Routes:
  1. UNI -> CAMELOT: $56.78 USDC (89 scans)
  2. SUSHI -> CAMELOT: $32.12 USDC (67 scans)
  ...

Trade Size Performance:
  Size $100: Avg $0.32/scan (2.1% profitable, 45 scans)
  Size $250: Avg $0.41/scan (3.2% profitable, 50 scans)
  ...

==================================================
```

### 5. Integration with Monitor (`src/monitor/liveMonitor.ts`)
- **Automatic Saving**: Every opportunity is saved (including negative ones)
- **Hourly Dashboard**: Prints stats every 720 scans (1 hour at 5s intervals)
- **Graceful Shutdown**: Properly closes database on exit

## Usage

### Running the Monitor
```bash
npx ts-node src/monitor/liveMonitor.ts
```

This automatically:
1. Initializes the database
2. Scans the market every 5 seconds
3. Saves all opportunities to SQLite
4. Prints hourly dashboard after 720 scans

### Analyzing Historical Data

#### Tools Script
```bash
# Show last 1 hour stats
npx ts-node src/tools.ts stats-1h

# Show last 24 hours stats
npx ts-node src/tools.ts stats-24h

# Show all-time stats
npx ts-node src/tools.ts stats-all

# Count opportunities in a window
npx ts-node src/tools.ts count-1h

# Track opportunity lifetime
npx ts-node src/tools.ts lifetime LINK "UNI -> SUSHI" 500

# Cleanup data older than 7 days
npx ts-node src/tools.ts cleanup-7d

# Test the database system
npx ts-node src/tools.ts test-save
```

## Database Location
```
./arbitrage.db
```

SQLite database file created on first run. Contains all historical opportunity data.

## Key Design Decisions

1. **Save Everything**: Even negative opportunities are saved because:
   - Helps calculate profitability frequency
   - Enables win-rate analysis
   - Reveals which size/token combos are unprofitable

2. **Timestamp-based Indexing**: Queries are fast even with years of data

3. **Opportunity Lifetime Calculation**: Uses 30-second gap threshold to detect new instances

4. **Modular Analytics**: Each stat type is a separate function, easy to extend

5. **Graceful Shutdown**: Database properly closes on signal (Ctrl+C)

## Database Schema

```sql
CREATE TABLE opportunities (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL,      -- Unix timestamp
  token TEXT NOT NULL,              -- e.g., "LINK"
  route TEXT NOT NULL,              -- e.g., "UNISWAP -> SUSHI"
  size REAL NOT NULL,               -- Trade size in USDC
  gross_profit REAL NOT NULL,       -- Before gas and fees
  gas_cost REAL NOT NULL,           -- Gas cost in USDC
  flash_fee REAL NOT NULL,          -- Flash loan fee in USDC
  net_profit REAL NOT NULL,         -- Final profit/loss
  liquidity TEXT NOT NULL,          -- Pool liquidity
  dex_buy TEXT NOT NULL,            -- Buy-side DEX
  dex_sell TEXT NOT NULL            -- Sell-side DEX
);

CREATE INDEX idx_timestamp ON opportunities(timestamp);
```

## Future Enhancements

- Real-time dashboard with WebSocket updates
- Opportunity correlation analysis (which tokens move together)
- Predictive profitability modeling
- Time-of-day analysis (when are opportunities best?)
- Gas cost trends over time
- Slippage analysis by DEX pair

## Success Criteria ✅

- [x] SQLite Database setup
- [x] Automatic Recording of all opportunities
- [x] Profit Analytics (avg, max, min, frequency)
- [x] Lifetime Tracking (how long opportunities persist)
- [x] Hourly Statistics Dashboard
- [x] Integration with Live Monitor
- [x] Tools for manual analysis
- [x] Proper error handling and graceful shutdown
