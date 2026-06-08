# Arbitrum DEX Arbitrage Research

A **33-day empirical research project** investigating whether economically viable arbitrage opportunities exist on Arbitrum across Uniswap, SushiSwap, PancakeSwap, and Camelot.

This repository is a **research system**, not a production trading bot. After exhaustive testing across spot, stablecoin, and triangular arbitrage — including scanner audits, quote forensics, and a final validation pass — the conclusion is:

> **Arbitrum DEX markets are sufficiently efficient that no exploitable arbitrage edge exists under tested assumptions.**

See [docs/FINAL_VALIDATION.md](docs/FINAL_VALIDATION.md) for the full Day 33 audit.

---

## Research Conclusion

| Track | Scale | Result |
|-------|-------|--------|
| **Cross-DEX spot** | 10,701 opportunities logged | 102/102 audited routes were false positives; **0 profitable** after revalidation |
| **Stablecoin peg** | 145 snapshots | Max deviation **4.82 bps** vs **9–15 bps** profitability threshold |
| **Triangular** | 21,504 route permutations, 5,479 evaluations | **0 profitable**; best route **-1.83%** net at $1k |
| **Final validation** | Pool, quote, route, liquidity audits | **No material bugs**; hypothesis rejected with **high confidence** |

**Decision:** Conclude arbitrage research. Infrastructure is suitable for repurposing as a DeFi market intelligence platform.

---

## What This Project Does

The codebase implements a full research pipeline:

1. **Multi-DEX scanning** — discovers pools, fetches live quotes, logs opportunities to SQLite
2. **Opportunity validation** — re-quotes stored opportunities to detect scanner artifacts
3. **Forensic analysis** — traces quote legs, compares DEX parity, detects phantom spreads
4. **Stablecoin research** — monitors USDC/USDT/DAI peg deviations across venues
5. **Triangular engine** — generates token graphs, DEX permutations, simulates 3-leg routes
6. **Historical replay** — rescores opportunities under different fee and size assumptions
7. **Flash-loan contracts** — Hardhat contracts for route validation (Sepolia); never deployed profitably on mainnet

### DEXes Covered

Uniswap V3 · SushiSwap V3 · PancakeSwap V3 · Camelot

### Tokens Researched

WETH · ARB · USDC · LINK · UNI · PENDLE · WBTC · GMX · USDT · DAI

---

## Research Timeline (33 Days)

| Phase | Days | Focus | Outcome |
|-------|------|-------|---------|
| Scanner build | 1–14 | Cross-DEX spot scanner, SQLite logging | Scanner operational; opportunities logged |
| Diagnostics | 15–18 | Pool validation, triangle simulator | Quote inconsistencies found |
| Historical analysis | 19–21 | Replay engine, opportunity density | Spreads don't persist |
| Audit & forensics | 25–27 | Scanner audit, quote forensics, fixes | **100% false positive rate** on audited routes |
| Market expansion | 28–29 | New tokens, PancakeSwap validation | No new profitable routes |
| Stablecoin research | 30 | Peg monitor, Curve inventory | Spreads below fee threshold |
| Strategic review | 31 | Direction validation | Triangular chosen as last path |
| Triangular engine | 32 | 336 cycles, 21,504 permutations | Near-break-even was **accounting bug**; corrected: -2% to -5% net |
| Final validation | 33 | Pool/quote/route/liquidity audits | **Go/No-Go: No-Go** |

### Key Findings

**Spot arbitrage** — Scanner logged thousands of "profitable" opportunities, but Day 25 audit re-quoted 102 routes live: every single one was a false positive caused by stale quotes, pool mismatches, or spread calculation artifacts.

**Stablecoin arbitrage** — Maximum observed peg deviation was 4.82 basis points. Minimum profitable spread at tested sizes was 9–15 bps (flash fee + swap fees + gas + slippage). Stablecoin arb is not viable at research scale.

**Triangular arbitrage** — Day 31 reported WETH→ARB→USDC→WETH at -$1.46 net (near break-even). Day 32 discovered a **units bug**: the simulator compared WETH token amounts as USDC dollars. After fixing USD accounting and multi-fee-tier pool selection, best routes are **-$18 to -$27** net at $1,000 — structural losses from 3× swap fees, not missing alpha.

**Day 33 validation** — Independent audits confirmed: pool discovery adequate on core pairs, route construction correct (336 cycles, no exclusions), zero accounting errors in re-quote sample, losses driven by fees and market efficiency.

---

## Architecture

```
src/
├── scanner/          # Cross-DEX market scanner
├── quotes/           # Uniswap, Sushi, Pancake, Camelot quoters
├── discovery/        # Pool discovery per DEX and fee tier
├── database/         # SQLite opportunity storage
├── audit/            # Scanner audit, quote consistency, slippage
├── forensics/        # Quote tracing, phantom spread detection
├── stablecoin/       # Peg monitor and Curve research
├── triangular/       # Token graph, DEX permutations, simulator
├── research/         # Reports, validation audits, strategy analysis
├── backtest/         # Historical replay engine
├── execution/        # Gas estimation, execution planning
└── tools.ts          # CLI entry point for all research commands
```

Data is stored in `arbitrage.db` (SQLite, local only):

- `opportunities` — spot arb scan results
- `audit_results` — revalidation outcomes
- `quote_traces` — forensic leg-level quotes
- `peg_snapshots` — stablecoin deviation history
- `triangular_opportunities` — triangular route evaluations

---

## Setup

**Requirements:** Node.js 18+, Arbitrum RPC URL

```bash
git clone https://github.com/shubham5080/arbitrum-arbitrage-bot.git
cd arbitrum-arbitrage-bot
npm install
```

Create `.env`:

```env
RPC_URL=https://arb1.arbitrum.io/rpc
```

---

## Commands

### Research & Reports

```bash
npm run research:final-validation   # Day 33 go/no-go audit
npm run research:triangle           # Triangular research report
npm run research:stablecoin         # Stablecoin peg research
npm run research:strategy           # Strategic direction report
```

### Scanning & Monitoring

```bash
npx ts-node src/tools.ts triangle-scan       # Single triangular scan cycle
npm run triangle:monitor                     # Continuous triangular collection
npm run stablecoin:scan                      # Peg deviation scan
```

### Audits

```bash
npx ts-node src/tools.ts scanner-audit       # Revalidate stored opportunities
npx ts-node src/tools.ts quote-forensics     # Quote engine forensics
```

### Contracts (Sepolia testnet only)

```bash
npm run compile
npm run test:contracts
npm run deploy:sepolia
```

---

## Cost Model Used Throughout Research

| Component | Assumption |
|-----------|------------|
| Flash loan fee | 0.05–0.09% (Aave V3 premium) |
| Swap fees | 1–30 bps per leg (pool fee tier dependent) |
| Gas (Arbitrum) | ~$0.03–0.05 per multi-swap route |
| Slippage | Live quoter output (no synthetic mid-price) |
| Trade sizes tested | $1k · $5k · $10k · $25k |

---

## What We Learned

1. **Scanner profit ≠ real profit.** Always revalidate with live quotes before acting on logged opportunities.
2. **Unit consistency matters.** Mixing token amounts and USD values produces false near-break-even signals.
3. **Fee math dominates on L2.** Three-leg routes need >30 bps gross edge before flash fee and gas — rare in efficient markets.
4. **Stablecoin arb needs depeg events.** 1–5 bps routine spreads don't cover friction at research scale.
5. **Pool discovery must check all fee tiers.** Highest-liquidity pool selection can pick wrong tier for large trades.

---

## License

ISC

---

## Disclaimer

This project is for **research and educational purposes only**. It does not constitute financial advice. On-chain trading involves substantial risk. No profitable execution strategy was validated during this research.
