# Poseidon2 layout comparison: `mt` vs `K=4 + chunk stealer` vs `K=8 + ext-compressed`

## Summary

- **K=4 is the practical sweet spot.** ~10% native time and modest memory savings vs `mt`, no per-flow regression. K=4 divides the internal-rounds row count by 4 without widening the trace.
- **K=8 regresses on app/kernel proving (~+9% native time, +14% peak memory vs K=4)**, even though it ships a real row reduction. The K=8 layout packs 8 internal rounds per row (vs K=4's 4) by spreading the same per-permutation cell count across 4 main + 4 auxiliary wires (`p2_w_5..p2_w_8`), so total MSM scalar-muls per perm are unchanged — just redistributed across more, shorter wires. The actual costs:
  - The 4 aux witness wires are *true* new global entities: each is committed (one extra MSM per prove), takes a full-length polynomial worth of memory, and is evaluated by sumcheck at every active row. The 3 shifted precomputed selectors (`q_l/q_r/q_o` shifts) and 2 new K=8 round-constant selectors (`q_5`, `q_6`) cost less — shifts share memory with their unshifted polys (no extra commitment, no extra storage); the new selectors are committed once at VK preprocess time. Their prover-side cost is per-row sumcheck eval work (5 extra entity evals per round) plus extra proof bytes.
  - From K=4, Poseidon2 is no longer a dominant block in tx circuits.
- **Standalone Poseidon2 hash proving (last section) shows the regime where K=8 *does* win** — when Poseidon owns the trace, the dyadic drops one full tier and sumcheck/PCS halve, beating the column tax by 5–7%.
- **Apps.** Deployment-class apps (`ContractClassRegistry:publish` 55%, `AMM:add_liquidity` 38%, `FPC:fee_entrypoint_private` 37%, `StorageProofTest:storage_proof` 28%, `TokenBridge:claim_private` 17%) and a tier of token apps (~10–15%) benefit substantially from K=4/K=8 compression. Account/entrypoint/verify-style apps (`EcdsaRAccount:entrypoint` 1.7%, `EcdsaRAccount:verify_private_authwit` 0.7%, `MultiCallEntrypoint:entrypoint` 1.7%, `StorageProofTest:verify_storage_proof_path_recursively` 1.0%, `SponsoredFPC:sponsor_unconditionally` 0.1%) barely touch poseidon — their totals move by tenths of a percent across all three layouts.

## Branches

| Variant | Branch | Tip | Pinned IVC inputs | Poseidon2 layout |
|---|---|---|---|---|
| `mt` | `merge-train/barretenberg` | `a97228435` | `286d8dd0` | one row per round (`poseidon ext` + `poseidon int`), ~73 g/perm |
| `K=4` | `si/poseidon2-opt-attempt` (with `lde/sumcheck-thread-strategy`) | `52082aca974` | `95b46ef9` (timing) / `925ca2b5` (gates) | 4 internal rounds/row + 2 external rounds/row, ~32 g/perm |
| `K=8` | `si/p2-with-k8` | `b94bdc7c9c8` | `394deda8` | 8 internal rounds/row + 2 external rounds/row, ~14.5 g/perm; adds 4 witness columns and 3 shifted precomputed selectors globally |

All three variants run on top of PR #22678 (work-stealing sumcheck).

## Native proving time (s)

Single-run remote EC2 (AMD EPYC 7R13, `HARDWARE_CONCURRENCY=16`), `bb prove --scheme chonk`:

| Flow | mt | K=4 | K=8 |
|---|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 7.43 | 6.75 | 7.38 |
| deploy_schnorr+sponsored_fpc | 7.25 | 6.34 | 6.94 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 12.43 | 10.97 | 12.21 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 7.95 | 6.96 | 7.56 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 16.40 | 15.37 | 16.49 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 6.75 | 6.25 | 6.75 |
| ecdsar1+transfer_0_recursions+private_fpc | 9.76 | 8.72 | 9.68 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 5.82 | 5.37 | 5.71 |
| ecdsar1+transfer_1_recursions+private_fpc | 11.01 | 9.70 | 10.86 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 6.84 | 6.20 | 6.75 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 7.83 | 6.61 | 7.21 |
| **TOTAL** | **99.47** | **89.24** (-10.3%) | **97.54** (-1.9%) |

## Native peak memory (MB)

| Flow | mt | K=4 | K=8 |
|---|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 307 | 299 | 338 |
| deploy_schnorr+sponsored_fpc | 309 | 301 | 303 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 491 | 447 | 485 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 457 | 408 | 389 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 850 | 896 | 1021 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 311 | 302 | 315 |
| ecdsar1+transfer_0_recursions+private_fpc | 426 | 389 | 425 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 290 | 285 | 298 |
| ecdsar1+transfer_1_recursions+private_fpc | 488 | 417 | 453 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 305 | 297 | 317 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 455 | 372 | 373 |
| **PEAK** | **850** | **896** (+5.4%) | **1021** (+20.1%) |

## WASM proving time (s)

WASM run via wasmtime on the same remote machine. **K=8 not measured** due to visible native regressions.

| Flow | mt | K=4 | K=8 |
|---|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 25.81 | 23.91 | — |
| deploy_schnorr+sponsored_fpc | 20.14 | 18.06 | — |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 35.41 | 31.53 | — |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 22.63 | 19.68 | — |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 51.07 | 48.67 | — |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 19.32 | 17.79 | — |
| ecdsar1+transfer_0_recursions+private_fpc | 27.87 | 24.97 | — |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 16.56 | 15.29 | — |
| ecdsar1+transfer_1_recursions+private_fpc | 31.48 | 27.82 | — |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 19.39 | 17.76 | — |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 21.58 | 18.93 | — |
| **TOTAL** | **291.26** | **264.41** (-9.2%) | **—** |

## App circuits — poseidon2 share of total gates

| Circuit | mt | K=4 | K=8 |
|---|---:|---:|---:|
| AMM:add_liquidity | 12005 (38.5%) | 9179 (19.6%) | 8276 (10.8%) |
| ContractClassRegistry:publish | 245701 (55.0%) | 163047 (32.2%) | 136833 (19.2%) |
| ContractInstanceRegistry:publish_for_public_execution | 7442 (14.5%) | 6788 (6.2%) | 6574 (3.2%) |
| EcdsaRAccount:constructor | 38036 (12.5%) | 35127 (5.3%) | 34198 (2.7%) |
| EcdsaRAccount:entrypoint | 120577 (1.7%) | 119308 (0.7%) | 118899 (0.3%) |
| EcdsaRAccount:verify_private_authwit | 80447 (0.7%) | 80121 (0.3%) | 80011 (0.1%) |
| FPC:fee_entrypoint_private | 11459 (36.9%) | 8879 (18.5%) | 8054 (10.2%) |
| MultiCallEntrypoint:entrypoint | 44739 (1.7%) | 44290 (0.7%) | 44141 (0.3%) |
| SchnorrAccount:constructor | 31171 (10.1%) | 29246 (4.2%) | 28629 (2.1%) |
| SchnorrAccount:entrypoint | 52531 (3.8%) | 51303 (1.5%) | 50907 (0.8%) |
| SponsoredFPC:sponsor_unconditionally | 5510 (0.1%) | 5512 (0.1%) | 5506 (0.0%) |
| StorageProofTest:storage_proof | 116706 (28.5%) | 96331 (13.4%) | 89864 (7.2%) |
| StorageProofTest:verify_storage_proof_path_recursively | 400295 (1.0%) | 397960 (0.4%) | 397213 (0.2%) |
| Token:_recurse_subtract_balance | 71116 (13.1%) | 65419 (5.5%) | 63606 (2.8%) |
| Token:mint_to_private | 7514 (15.2%) | 6819 (6.6%) | 6592 (3.4%) |
| Token:prepare_private_balance_increase | 7427 (14.5%) | 6773 (6.2%) | 6559 (3.2%) |
| Token:transfer | 40566 (9.6%) | 38190 (4.0%) | 37430 (2.0%) |
| Token:transfer_to_public | 165133 (12.5%) | 152507 (5.3%) | 148497 (2.7%) |
| Token:transfer_to_public_and_prepare_private_balance_increase | 175393 (11.9%) | 162603 (5.0%) | 158541 (2.6%) |
| TokenBridge:claim_private | 37633 (17.3%) | 33660 (7.5%) | 32393 (3.9%) |

## Kernel circuits — poseidon2 share of total gates

| Circuit | mt | K=4 (925) | K=8 |
|---|---:|---:|---:|
| hiding_kernel #1 | 39227 (61.7%) | 24880 (38.4%) | 20994 (23.8%) |
| hiding_kernel #2 | 42411 (57.0%) | 28064 (34.0%) | 24178 (20.6%) |
| private_kernel_init #1 | 47289 (43.2%) | 35237 (23.0%) | 32080 (13.3%) |
| private_kernel_inner #1 | 102850 (44.0%) | 76040 (23.5%) | 68892 (13.6%) |
| private_kernel_reset #1 | 113025 (41.1%) | 85026 (21.4%) | 76811 (12.1%) |
| private_kernel_reset #2 | 122995 (41.1%) | 92536 (21.4%) | 83541 (12.1%) |
| private_kernel_reset #3 | 178223 (50.0%) | 124148 (28.0%) | 107665 (16.3%) |
| private_kernel_reset #4 | 220178 (55.8%) | 145439 (32.9%) | 122404 (19.7%) |
| private_kernel_tail #1 | 45739 (48.3%) | 32662 (26.8%) | 29179 (15.7%) |
| private_kernel_tail #2 | 90300 (24.5%) | 77223 (11.3%) | 73740 (6.2%) |

## Standalone Poseidon2 hash proving (Ultra vs Mega)

Isolated benchmark of a single Poseidon2 hash over a vector of `N` field elements, proven directly with `UltraProver` / `MegaProver` (no IVC, no client circuits, no `bb prove`). The trace is dominated by Poseidon2 — it's the regime where compression's row-savings show up cleanest. Bench code: `barretenberg/cpp/src/barretenberg/benchmark/ultra_bench/{ultra_honk,mega_honk}.bench.cpp::construct_proof_*_poseidon2_hash`. Remote AMD EPYC 7R13, `HARDWARE_CONCURRENCY=16`, **prove-only** (circuit construction and VK creation paused out of the timed region).

Ultra is unchanged across all three branches (no Poseidon2 compression on Ultra), so its column applies to all three. Mega-K=4 numbers are from [`poseidon2-compression-analysis.md`](poseidon2-compression-analysis.md) (K=4 branch); Mega-K=8 measured fresh on `si/p2-with-k8`.

### Circuit sizes

| `N` | Ultra gates | Ultra dyadic | Mega K=4 gates | Mega K=4 dyadic | Mega K=8 gates | Mega K=8 dyadic |
|----:|------------:|:-----:|---------------:|:-----:|---------------:|:-----:|
| 1,500  | 38,016    | 2^16 | 17,524  | 2^15 | 11,018  | 2^14 |
| 3,000  | 76,016    | 2^17 | 35,024  | 2^16 | 22,018  | 2^15 |
| 6,000  | 152,016   | 2^18 | 70,024  | 2^17 | 44,018  | 2^16 |
| 12,000 | 304,016   | 2^19 | 140,024 | 2^18 | 88,018  | 2^17 |
| 24,000 | —         | —    | —       | —    | 176,018 | 2^18 |
| 50,000 | 1,266,707 | 2^21 | 583,368 | 2^20 | 366,691 | 2^19 |

Per-input gate cost: Ultra ~25.3, Mega K=4 ~11.7 (~2.17× fewer per hash), Mega K=8 ~7.3 (another ~37% fewer than K=4). Mega K=8 lands one full dyadic tier below Mega K=4 at every input count.

### Total prove time (ms)

| `N` | Ultra | Mega K=4 | Mega K=8 | K=4 vs Ultra | K=8 vs Ultra | K=8 vs K=4 |
|----:|------:|---------:|---------:|:------------:|:------------:|:----------:|
| 1,500  | 302   | 202   | 191   | 1.50× faster | 1.58× faster | 0.95× |
| 3,000  | 498   | 316   | 295   | 1.58× faster | 1.69× faster | 0.93× |
| 6,000  | 883   | 523   | 495   | 1.69× faster | 1.78× faster | 0.95× |
| 12,000 | 1,607 | 933   | 871   | 1.72× faster | 1.85× faster | 0.93× |
| 24,000 | —     | —     | 1,595 | —            | —            | —     |
| 50,000 | 5,753 | 3,285 | 3,061 | 1.75× faster | 1.88× faster | 0.93× |

K=8 is consistently 5–7% faster than K=4 in standalone Mega proving — exactly where Poseidon2 dominates the trace. The dyadic-tier drop is the proximate cause: sumcheck and PCS halve their domain. MSM scalar-mul *count* per perm is identical (88 cells/perm under both K=4 and K=8 — the K=8 layout just redistributes them across 8 wires/11 rows instead of 4 wires/22 rows), so the MSM contribution is roughly flat.

