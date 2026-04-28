# Why K=8 + 2-external-compressed is slower than K=4 on `si/p2-with-k8`

Single-run remote benchmark (AMD EPYC 7R13, `HARDWARE_CONCURRENCY=16`), `bb prove --scheme chonk` over the 11 pinned CI app-proving flows. Native results only — WASM run failed under wasmtime 43 due to a flag-syntax change for shared memory; not yet rerun.

**Branches**

| Column | Branch | Tip | Pinned IVC inputs | Notes |
|---|---|---|---|---|
| `mt` | `merge-train/barretenberg` | `a97228435` | `286d8dd0` | Stock baseline, no Poseidon2 compression, no work-stealing sumcheck |
| `si+22678` | `si/poseidon2-opt-attempt` (with `lde/sumcheck-thread-strategy`) | `52082aca974` | `95b46ef9` | K=4-internal Poseidon2 + 2-per-row external + work-stealing sumcheck (PR #22678) |
| `si+k8` | `si/p2-with-k8` (current branch) | `b94bdc7c9c8` | `394deda8` | K=8-internal Poseidon2 + 2-per-row external + work-stealing sumcheck (inherited from merge-train, PR #22678 already merged in) |

`si+22678` numbers from `bench-baseline-si22678-vs-mt.md`. `mt` numbers from same source. `si+k8` numbers measured 2026-04-28 with current `bb`.

## Native time per flow (seconds)

| Flow | mt | si+22678 | **si+k8** | Δ vs mt | Δ vs si+22678 |
|---|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    |  7.43 |  6.75 |  7.38 |  −0.7% |  +9.3% |
| deploy_schnorr+sponsored_fpc                                    |  7.25 |  6.34 |  6.94 |  −4.3% |  +9.5% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 12.43 | 10.97 | 12.21 |  −1.8% | +11.3% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    |  7.95 |  6.96 |  7.56 |  −4.9% |  +8.6% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 16.40 | 15.37 | 16.49 |  +0.5% |  +7.3% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                |  6.75 |  6.25 |  6.75 |   0%   |  +8.0% |
| ecdsar1+transfer_0_recursions+private_fpc                       |  9.76 |  8.72 |  9.68 |  −0.8% | +11.0% |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     |  5.82 |  5.37 |  5.71 |  −1.9% |  +6.3% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 11.01 |  9.70 | 10.86 |  −1.4% | +12.0% |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     |  6.84 |  6.20 |  6.75 |  −1.3% |  +8.9% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    |  7.83 |  6.61 |  7.21 |  −7.9% |  +9.1% |
| **total**                                                       | **99.47** | **89.23** | **97.54** | **−1.9%** | **+9.3%** |

## Native peak memory per flow (MB)

| Flow | mt | si+22678 | **si+k8** | Δ vs mt | Δ vs si+22678 |
|---|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    | 307 | 299 |  338 | +10.1% | +13.0% |
| deploy_schnorr+sponsored_fpc                                    | 309 | 301 |  303 |  −1.9% |  +0.7% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 491 | 447 |  485 |  −1.2% |  +8.5% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    | 457 | 408 |  389 |  −14.9% |  −4.7% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 850 | 896 | 1021 | +20.1% | +14.0% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                | 311 | 302 |  315 |  +1.3% |  +4.3% |
| ecdsar1+transfer_0_recursions+private_fpc                       | 426 | 389 |  425 |  −0.2% |  +9.3% |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     | 290 | 285 |  298 |  +2.8% |  +4.6% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 488 | 417 |  453 |  −7.2% |  +8.6% |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     | 305 | 297 |  317 |  +3.9% |  +6.7% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    | 455 | 372 |  373 |  −18.0% |  +0.3% |
| **peak**                                                        | **850** | **896** | **1021** | **+20.1%** | **+14.0%** |

## Headline

- vs `mt`: **−1.9% time, +20% memory peak**. K=8 is roughly tied on time and a clear regression on memory.
- vs `si+22678`: **+9.3% time, +14% memory peak**. K=8 + WS is a clean regression vs K=4 + WS.

## Why does K=8 regress vs K=4

K=8 trades **fewer poseidon rows** for **more global trace width**. The width cost wins.

### What K=8 added globally

- **4 new witness columns**: `p2_w_5..p2_w_8` (auxiliary state values for s_0 at internal rounds 4..7 within each K=8-packed row).
- **3 new shifted precomputed selectors**: `q_l_shift`, `q_r_shift`, `q_o_shift` — round-constant pickup for the next K=8 row.
- **4 new gate-selector relations** replacing the 2 standard Poseidon2 relations: `external_compressed`, `transition_entry_k8`, `k8_internal`, `k8_internal_terminal`.

These are added to the **whole** Mega witness/precomputed layout, even though they're only non-zero inside Poseidon2 blocks.

### What K=8 saves

K=8 packs 8 internal rounds per row vs K=4's 4 → halves the internal-rounds row count. Concretely: across the 11 flows, the previous analysis ([`poseidon-savings-analysis.md`](poseidon-savings-analysis.md)) had ~32 g/perm with K=4, projecting ~20 g/perm under further compaction — a ~6% gate reduction across the optimized trace.

### Why the trade-off goes the wrong way

Mega proving cost scales as roughly `(num_witness_cols + num_shifted_precomputed) × num_rows × per-row-relation-cost`.

- **Witness payload widens**: Mega had ~17 witness columns; K=8 adds 4 → ~+24% witness columns. Pippenger short-circuits zero scalars, so the MSM cost goes up by less than the column ratio, but sumcheck univariate evaluation across all entities, polynomial memory, and proof size all grow linearly with column count regardless of zeros.
- **Sumcheck eval grows**: 4 extra entity evaluations per univariate round, plus 4 new relations to evaluate at every row.
- **Proof size grows**: `PROOF_LENGTH_WITHOUT_PUB_INPUTS` went 1290 → 1318 (+28). 28 = 4 new witness commitment evals × 2 (eval + shifted-eval if shifted) + 4 new commitments serialized as field-pair coordinates.
- **Memory grows**: 4 extra full-length polynomials in the prover instance. Storage_proof flow shows the worst case: +20% peak vs `mt`, +14% vs si+22678.

The poseidon block is now ~7–22% of the trace ([`poseidon-savings-analysis.md`](poseidon-savings-analysis.md)). Halving the internal portion of that small slice doesn't pay back the full-trace widening cost: K=8 reduces row count by ~3–4% of total but pays ~+15–25% of "per-column-per-row" work everywhere.

### Why si+22678 (K=4) didn't suffer

The 925ca2b5 snapshot used 2-per-row external-compressed but kept the standard 4-wire layout for internal rounds — no `p2_w_5..p2_w_8`, no global trace widening. It got the row savings without paying the column tax. Net result: −10% time, no memory regression.

## Possible mitigations

The fundamental issue is treating `p2_w_5..p2_w_8` as global witness columns when they're only used inside Poseidon blocks. Options:

1. **Reuse existing witness columns** for the K=8 aux state. If a Poseidon block doesn't overlap with rows that need full `(w_l, w_r, w_o, w_4)` independently, repurpose those wires inside K=8 rows. Risk: aliasing constraints get fragile, complicates trace layout.
2. **Accept K=4 + 2-per-row external** as the optimal Poseidon2 packing on Mega. The si+22678 numbers (89.23s native total, no memory regression) are the practical ceiling unless the column-tax problem is solved.
3. **Drop K=8 entirely**, keep si+22678's design.

Memory regression alone (especially +20% on storage_proof, +10% on small flows) is enough to argue against shipping K=8 in its current form.
