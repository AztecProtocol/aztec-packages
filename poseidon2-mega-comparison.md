# Mega Poseidon2 compression: K=4 vs K=8

## Variants

| Name | Branch | Poseidon2 layout | Latest tip with CI data |
|---|---|---|---|
| `mt` | `merge-train/barretenberg` | 56 internal rounds, one row each | `fd3bf5628dbf` (2026-05-03) |
| `K=4` | `si/poseidon2-opt-attempt` (PR #22652) | 56 → 14 quad-internal rows + dedicated initial-external-linear-layer row | `ba3266f27f` |
| `K=8` | `si/p2-with-k8` | 56 → 7 K=8-internal rows + 8 → 4 external rounds + dedicated initial-external-linear-layer row | `4da41cd669` |

`mt` numbers are the latest entry on the prs dashboard. Both K=4 and K=8 branches target
`merge-train/barretenberg`. Each branch is benched against its own pinned IVC inputs.

Source: <https://aztecprotocol.github.io/benchmark-page-data/bench/?branch=prs>.

## Standalone Mega Poseidon2 hash proving

Single Poseidon2 sponge over `N` field elements, proven directly with `MegaProver` (no IVC, no
`bb prove`). Bench:
`barretenberg/cpp/src/barretenberg/benchmark/ultra_bench/{ultra_honk,mega_honk}.bench.cpp::construct_proof_*_poseidon2_hash`.
Prove-only (circuit construction + VK creation paused out of the timed region).

### Circuit sizes

| `N` | Ultra gates | Ultra dyadic | Mega K=4 gates | Mega K=4 dyadic | Mega K=8 gates | Mega K=8 dyadic |
|----:|------------:|:-----:|---------------:|:-----:|---------------:|:-----:|
|  1,500  |   38,016 | 2^16 |  15,002 | 2^14 |   8,502 | 2^14 |
|  3,000  |   76,016 | 2^17 |  30,002 | 2^15 |  17,002 | 2^15 |
|  6,000  |  152,016 | 2^18 |  60,002 | 2^16 |  34,002 | 2^16 |
| 12,000  |  304,016 | 2^19 | 120,002 | 2^17 |  68,002 | 2^17 |
| 24,000  |  608,016 | 2^20 | 240,002 | 2^18 | 136,002 | 2^18 |
| 50,000  | 1,266,707 | 2^21 | 500,011 | 2^19 | 283,340 | 2^19 |


### Total prove time (ms)

| `N` | Ultra | Mega K=4 | Mega K=8 | K=4 vs Ultra | K=8 vs Ultra | K=8 vs K=4 |
|----:|------:|---------:|---------:|:------------:|:------------:|:----------:|
|  1,500  |   302 |   179 |   173 | 1.69× | 1.75× | −3.4% |
|  3,000  |   498 |   276 |   252 | 1.80× | 1.98× | −8.7% |
|  6,000  |   883 |   452 |   410 | 1.95× | 2.15× | −9.3% |
| 12,000  | 1,607 |   802 |   697 | 2.00× | 2.31× | −13.1% |
| 50,000  | 5,753 | 2,742 | 2,432 | 2.10× | 2.37× | −11.3% |

## Poseidon2 share of total gates

Aggregated across all unique circuits referenced by the 11 pinned CI flows on each branch (deduped
by `(circuit_name, total_size)`). Post-`finalize_circuit` block sizes captured by instrumenting
`ChonkAccumulate::execute` to call `circuit.blocks.summarize()` after finalize.

### Aggregate

| Branch | Pinned hash | Apps p2 | Kernels p2 | Overall p2 | p2 gates | Total gates |
|---|---|---:|---:|---:|---:|---:|
| `mt`  | `c09aeb0c` | 18.4% | 48.1% | 31.2% |   770,902 | 2,468,863 |
| `K=4` | `5bb3476e` |  8.5% | 29.2% | 16.1% |   313,038 | 1,939,777 |
| `K=8` | `6f6974ec` |  4.6% | 17.8% |  9.2% |   164,780 | 1,797,539 |

Total gates: K=4 −21.4% vs `mt`, K=8 −7.3% vs K=4.

### Per-app circuits — total gates and poseidon2 share

| Circuit | mt | K=4 | K=8 |
|---|---:|---:|---:|
| AMM:add_liquidity | 11,988 (38.6%) | 8,814 (21.1%) | 7,917 (12.2%) |
| ContractClassRegistry:publish | 245,656 (55.0%) | 152,917 (35.6%) | 126,709 (22.3%) |
| ContractInstanceRegistry:publish_for_public_execution | 7,424 (14.4%) | 6,688 (6.5%) | 6,480 (3.5%) |
| EcdsaRAccount:constructor | 38,017 (12.5%) | 34,751 (5.5%) | 33,828 (2.9%) |
| EcdsaRAccount:entrypoint | 90,359 (2.3%) | 88,900 (0.9%) | 88,497 (0.5%) |
| EcdsaRAccount:verify_private_authwit | 80,428 (0.7%) | 80,060 (0.3%) | 79,956 (0.1%) |
| FPC:fee_entrypoint_private | 11,442 (36.9%) | 8,544 (19.9%) | 7,725 (11.4%) |
| MultiCallEntrypoint:entrypoint | 14,521 (5.1%) | 13,982 (2.1%) | 13,839 (1.1%) |
| SchnorrAccount:constructor | 31,152 (10.1%) | 28,990 (4.4%) | 28,379 (2.3%) |
| SchnorrAccount:entrypoint | 22,313 (9.0%) | 20,900 (3.9%) | 20,510 (2.0%) |
| SponsoredFPC:sponsor_unconditionally | 5,491 (0.0%) | 5,491 (0.0%) | 5,491 (0.0%) |
| StorageProofTest:storage_proof | 115,803 (28.8%) | 92,746 (14.5%) | 86,285 (8.1%) |
| StorageProofTest:verify_storage_proof_path_recursively | 387,013 (1.0%) | 383,517 (0.4%) | 382,776 (0.2%) |
| Token:_recurse_subtract_balance | 45,231 (20.6%) | 38,779 (9.7%) | 36,972 (5.3%) |
| Token:mint_to_private | 7,496 (15.2%) | 6,714 (6.8%) | 6,493 (3.7%) |
| Token:prepare_private_balance_increase | 7,409 (14.5%) | 6,673 (6.5%) | 6,465 (3.5%) |
| Token:transfer | 23,083 (16.8%) | 20,407 (7.7%) | 19,653 (4.1%) |
| Token:transfer_to_public | 109,021 (18.9%) | 94,735 (8.8%) | 90,731 (4.8%) |
| Token:transfer_to_public_and_prepare_private_balance_increase | 112,464 (18.6%) | 97,994 (8.6%) | 93,938 (4.6%) |
| TokenBridge:claim_private | 37,617 (17.3%) | 33,155 (7.9%) | 31,894 (4.3%) |

### Per-kernel-variant — total gates and poseidon2 share

Sorted by total size ascending; rank index `#i` aligns the same size tier across branches.

| Circuit | mt | K=4 | K=8 |
|---|---:|---:|---:|
| hiding_kernel #1 | 82,406 (65.8%) | 45,716 (48.3%) | 35,867 (32.5%) |
| hiding_kernel #2 | 85,590 (63.3%) | 48,900 (45.1%) | 39,051 (29.9%) |
| private_kernel_init | 44,976 (42.2%) | 32,482 (24.2%) | 29,470 (14.6%) |
| private_kernel_inner | 98,209 (43.1%) | 70,104 (25.0%) | 63,223 (15.1%) |
| private_kernel_reset #1 | 110,244 (40.5%) | 79,396 (23.0%) | 71,392 (13.6%) |
| private_kernel_reset #2 | 120,214 (40.5%) | 86,606 (22.9%) | 77,822 (13.5%) |
| private_kernel_reset #3 | 175,442 (49.8%) | 115,338 (30.7%) | 99,066 (18.8%) |
| private_kernel_reset #4 | 217,397 (55.7%) | 134,109 (36.5%) | 111,285 (23.0%) |
| private_kernel_tail #1 | 42,948 (47.3%) | 29,534 (28.4%) | 26,262 (17.4%) |
| private_kernel_tail #2 | 87,509 (23.2%) | 72,835 (11.5%) | 69,563 (6.6%) |

## App-proving end-to-end (11 pinned CI flows)

### Native total prove time (s)

| Flow | mt | K=4 | K=4 vs mt | K=8 (CI) |
|---|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                 |  7.63 |  6.24 | −18.2% |  6.48 |
| deploy_schnorr+sponsored_fpc                                 |  7.30 |  5.80 | −20.5% |  6.03 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc         | 12.61 | 10.00 | −20.7% | 10.32 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc |  8.38 |  6.98 | −16.7% |  6.82 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                 | 17.68 | 15.96 |  −9.7% | 16.07 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc             |  7.41 |  6.05 | −18.4% |  6.26 |
| ecdsar1+transfer_0_recursions+private_fpc                    | 10.36 |  7.97 | −23.1% |  8.23 |
| ecdsar1+transfer_0_recursions+sponsored_fpc                  |  6.01 |  5.19 | −13.6% |  5.38 |
| ecdsar1+transfer_1_recursions+private_fpc                    | 11.20 |  8.98 | −19.8% |  9.17 |
| ecdsar1+transfer_1_recursions+sponsored_fpc                  |  7.06 |  5.79 | −18.0% |  6.09 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc |  8.17 |  6.50 | −20.4% |  6.54 |

Native vs `mt`: K=4 per-flow range −9.7% to −23.1%, total −17.7%. K=8 total −15.8%.

### WASM total prove time (s)

| Flow | mt | K=4 | K=4 vs mt | K=8 (CI) |
|---|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                 | 25.04 | 21.56 | −13.9% | 22.62 |
| deploy_schnorr+sponsored_fpc                                 | 19.38 | 15.18 | −21.7% | 15.82 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc         | 32.99 | 25.99 | −21.2% | 27.52 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 21.71 | 17.22 | −20.7% | 17.64 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                 | 51.20 | 46.32 |  −9.5% | 46.82 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc             | 18.67 | 15.33 | −17.9% | 16.05 |
| ecdsar1+transfer_0_recursions+private_fpc                    | 26.13 | 20.68 | −20.9% | 21.48 |
| ecdsar1+transfer_0_recursions+sponsored_fpc                  | 16.02 | 13.40 | −16.4% | 14.01 |
| ecdsar1+transfer_1_recursions+private_fpc                    | 29.23 | 23.24 | −20.5% | 23.92 |
| ecdsar1+transfer_1_recursions+sponsored_fpc                  | 18.25 | 15.07 | −17.4% | 15.77 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 21.55 | 16.93 | −21.4% | 17.20 |

WASM vs `mt`: K=4 per-flow range −9.5% to −21.7%, total −17.6%. K=8 total −14.7%.

## Summary

- Standalone Mega Poseidon2 prove: K=8 is 8–13% faster than K=4 across all sizes; 2.37× faster
  than Ultra at N=50K.
- App proving native: K=4 vs `mt` per-flow range −9.7% to −23.1%, total −17.7%. K=8 total −15.8%.
- App proving WASM: K=4 vs `mt` per-flow range −9.5% to −21.7%, total −17.6%. K=8 total −14.7%.
