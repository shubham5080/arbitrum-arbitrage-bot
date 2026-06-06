# DAY 20 — Current State (Damm Good)

This document captures the current state of the Arbitrum arbitrage bot at the end of Day 20: what changed, current coverage, logs, and next steps.

**Overview**
- Purpose: validate why worst routes lost money, apply a cross-cutting liquidity filter, log rejections, and re-run scans.
- Outcome: low/zero liquidity pools were the primary cause; a global `MIN_POOL_LIQUIDITY` filter was added and enforced across discovery, quoting, validation, and simulation.

**Key Changes Implemented**
- `RISK.MIN_POOL_LIQUIDITY` added and applied everywhere before quoting and simulation.
- Rejection logger implemented and hardened to serialize `BigInt` values; writes to `logs/rejected_routes.jsonl`.
- Pool discovery and validation now skip and log pools below the liquidity threshold.
- Simulator emits per-leg provenance (`legPoolAddresses`, `legLiquidities`, `legOutputs`).

**Important Files**
- Config tokens: [src/config/tokens.ts](src/config/tokens.ts)
- Config dex list: [src/config/dexes.ts](src/config/dexes.ts)
- Day-20 test runner: [src/strategies/triangular/testTriangle.ts](src/strategies/triangular/testTriangle.ts)
- Rerun provenance: [src/strategies/triangular/rerunLossRoutes.ts](src/strategies/triangular/rerunLossRoutes.ts)
- Rejection log: [logs/rejected_routes.jsonl](logs/rejected_routes.jsonl)
- Scan outputs: [logs/triangle_results.jsonl](logs/triangle_results.jsonl), [logs/triangle_results_backup.jsonl](logs/triangle_results_backup.jsonl)

**Current Coverage & Logs (summary)**
- Tokens currently configured: 5 (WETH, ARB, LINK, UNI, WBTC) — see [src/config/tokens.ts](src/config/tokens.ts).
- DEXes configured: 3 (UNISWAP, SUSHI, CAMELOT) — see [src/config/dexes.ts](src/config/dexes.ts).
- Pre-filter aggregated stats (backup): count=290, avg profit % ≈ -50.48, profitable routes=36.
- Post-filter aggregated stats (fresh): count=8, avg profit % ≈ -15.36, profitable routes=0.
- Rejections logged: total_rejected=278, unique_pools=21, unique_tokenPaths=12.

**Top Observations**
- Most extreme negative outcomes were caused by near-zero or zero liquidity legs; removing those pools removed pathological results.
- After filtering, the remaining universe is much smaller and contains no profitable opportunities under current quote/fee assumptions.
- The rejection log highlights recurring low-liquidity pool addresses (see `logs/rejected_routes.jsonl`).

**Immediate Next Objective (Day 21 target)**
- Expand discovery search space by adding new token candidates and DEX adapters (Balancer, Curve). Keep all risk thresholds and quote logic unchanged.
- Candidate tokens proposed: GMX, RDNT, PENDLE, AAVE, CRV, LDO, COMP, MAGIC, GNS, XRP (wrapped, verify canonical address).
- Evaluate adding Balancer and Curve adapters; defer Trader Joe unless Arbitrum deployment is confirmed.

**Quantitative Projection (high-level)**
- Baseline theoretical upper-bound routes with 5 tokens and 3 DEXes: ~1.6k
- With +10 tokens (15 total) and up to 6 DEXes: theoretical upper-bound ≈ 589.7k (≈364× increase)
- Practical expected scanned routes after staged expansion: ~500–5,000 (depends on pool availability and rejection rate).

**Risks & Caveats**
- Curve and Balancer require specialized quoting logic and careful implementation of pool math.
- Adding many tokens increases RPC/quoter load; stage rollout and batch discovery to measure operational cost.
- Verify wrapped token contracts (XRP) before adding.

**Suggested Day-21 Plan (short)**
1. Add verified token metadata to `src/config/tokens.ts` (skeleton entries only if addresses not yet verified).
2. Run discovery for new tokens and capture rejection statistics.
3. Implement Balancer adapter (discovery + quote math) and run staged scans.
4. Implement Curve adapter and repeat staged scans.
5. Measure runtime, RPC usage, rejection rate, and report back.

**Status**
- Infrastructure fixes: complete.
- Liquidity filter and rejection logging: complete and validated.
- Expansion work: planning stage.

**Contacts / Notes**
- Logs and outputs are in the `logs/` directory. Use `testTriangle.ts` and `rerunLossRoutes.ts` for reproducing runs and per-route provenance.

---
Generated on: 2026-06-06
