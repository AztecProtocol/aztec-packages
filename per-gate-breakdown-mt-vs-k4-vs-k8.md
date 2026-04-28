# Per-gate breakdown: 3-way — `mt` vs `K=4` vs `K=8`

Three Poseidon2 layouts compared at the gate-block level.

| Variant | tag | source | g/perm (empirical) |
|---|---|---|---:|
| mt (merge-train, uncompressed) | `286d8dd0` mt-bb | one row per round (`poseidon ext` + `poseidon int`) | ~73 |
| K=4 (chunk-stealer, internal-rounds packed) | `925ca2b5` apps + projection | 4 internal rounds per row (`poseidon ext` + `poseidon dbl`) | ~32 |
| K=8 + ext-compressed (current `si/p2-with-k8`) | `394deda8` measured | 8 internal rounds per row + 2 external rounds per row (`p2_compressed`) | ~14.5 |

Cross-snapshot reconciliation: 925-era and 286-era inputs share **identical app bytecodes** (verified by hash) but **different kernel bytecodes** (kernels have grown).
- App rows below use **direct measurements** for all three variants (real bytecode, real bb).
- Kernel-flavored rows: K=4 numbers are reported as measured **on 925 inputs** (smaller kernel) — useful as a real K=4 datapoint, not directly comparable to mt/K=8 totals on 286 kernels.
- Per-flow totals (later in this file) project K=4 kernel costs onto 286 kernels using the empirical ratio K=4/mt = **0.389**, derived from the 20 app circuits where both are measured (consistency: every app circuit hits 0.388–0.392).

## App circuits — direct measurement (same bytecode, same inputs)

All three columns are real measurements; the bytecode hash is identical for K=4(925), mt(286), and K=8(394). Each cell shows `total (poseidon2 share %)`.

| Circuit | mt | K=4 | K=8 |
|---|---:|---:|---:|
| ContractClassRegistry:publish | 245701 (55.0%) | 163047 (32.2%) | 136833 (19.2%) |
| ContractInstanceRegistry:publish_for_public_execution | 7442 (14.5%) | 6788 (6.2%) | 6574 (3.2%) |
| EcdsaRAccount:constructor | 38036 (12.5%) | 35127 (5.3%) | 34198 (2.7%) |
| EcdsaRAccount:entrypoint | 120577 (1.7%) | 119308 (0.7%) | 118899 (0.3%) |
| EcdsaRAccount:verify_private_authwit | 80447 (0.7%) | 80121 (0.3%) | 80011 (0.1%) |
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

## Kernel circuits — variant-aligned, mixed snapshots

Each `#N` is the rank-by-total variant of that kernel circuit within the snapshot. **K=4 column is from 925-era inputs (smaller kernels)** — bytecodes do not match mt/K=8, so totals are not directly comparable. Each cell shows `total (poseidon2 share %)`.

| Circuit | mt | K=4 (925) | K=8 |
|---|---:|---:|---:|
| hiding_kernel #1 | 39227 (61.7%) | 24883 (38.4%) | 20994 (23.8%) |
| hiding_kernel #2 | 42411 (57.0%) | 28067 (34.0%) | 24178 (20.6%) |
| private_kernel_init #1 | 47289 (43.2%) | 35240 (23.0%) | 32080 (13.3%) |
| private_kernel_inner #1 | 102850 (44.0%) | 76046 (23.5%) | 68892 (13.6%) |
| private_kernel_reset #1 | 113025 (41.1%) | 85029 (21.4%) | 76811 (12.1%) |
| private_kernel_reset #2 | 122995 (41.1%) | 92539 (21.4%) | 83541 (12.1%) |
| private_kernel_reset #3 | 178223 (50.0%) | 124151 (28.0%) | 107665 (16.3%) |
| private_kernel_reset #4 | 220178 (55.8%) | 145442 (32.9%) | 122404 (19.7%) |
| private_kernel_tail #1 | 45739 (48.3%) | 32665 (26.8%) | 29179 (15.7%) |
| private_kernel_tail #2 | 90300 (24.5%) | 77226 (11.3%) | 73740 (6.2%) |

## Per-flow totals on 286 inputs

**mt** column is measured (from `per-gate-breakdown-286d8dd0-vs-925ca2b5.md`). **K=4** and **K=8** are projected by replacing `mt_p2` with `0.389 × mt_p2` and `0.194 × mt_p2` respectively (ratios verified across 20 app circuits, ±1%). For sanity, the rightmost columns show K=8 *measured* on 394 inputs (apps may differ slightly between 286 and 394 captures).

Each cell shows `total (poseidon2 share %)`.

| Flow | mt (meas) | K=4 (proj) | K=8 (proj) | K=8 meas (394) |
|---|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 872984 (34.7%) | 687794 (17.1%) | 628691 (9.4%) | 643950 (9.7%) |
| deploy_schnorr+sponsored_fpc | 798073 (37.8%) | 613907 (19.1%) | 555130 (10.5%) | 570389 (10.9%) |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 1777327 (31.4%) | 1436767 (15.1%) | 1328077 (8.1%) | 1350990 (8.4%) |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 980805 (39.5%) | 744121 (20.3%) | 668584 (11.2%) | 681297 (11.5%) |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 2250953 (17.2%) | 2014751 (7.5%) | 1939367 (3.9%) | 1957177 (4.0%) |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 772809 (33.5%) | 614642 (16.4%) | 564164 (8.9%) | 576875 (9.2%) |
| ecdsar1+transfer_0_recursions+private_fpc | 1298082 (32.0%) | 1044645 (15.4%) | 963761 (8.3%) | 981573 (8.6%) |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 617633 (34.0%) | 489437 (16.7%) | 448524 (9.1%) | 458683 (9.4%) |
| ecdsar1+transfer_1_recursions+private_fpc | 1514003 (33.2%) | 1206566 (16.2%) | 1108447 (8.8%) | 1128810 (9.1%) |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 801569 (33.5%) | 637548 (16.4%) | 585202 (8.9%) | 597911 (9.2%) |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 912759 (42.4%) | 676116 (22.3%) | 600592 (12.5%) | 613305 (12.7%) |
| **TOTAL** | **12596997 (31.6%)** | **10166294 (15.2%)** | **9390539 (8.2%)** | **9560960 (8.5%)** |

## Summary

- Projected total gates across 11 flows: mt **12,596,997** → K=4 **10,166,294** (-19.3%) → K=8 **9,390,539** (-25.5%).
- K=8 vs K=4 incremental win (projected): **-7.6%** (775,755 gates saved).
- K=8 measured on 394 inputs total: **9,560,960** (matches projection within ~1%, validating the projection).
- K=4/mt p2 ratio is **0.389 ± 0.004** across the 20 app circuits (verified, identical bytecodes); K=8/mt p2 ratio is **0.194 ± 0.001** (also verified).
- mt → K=4 step removes ~61% of poseidon cost; K=4 → K=8 step removes another ~50% of remaining poseidon cost (i.e. K=8 is half of K=4 in the poseidon block).