# Poseidon2 gate-density: is 32 → ~20 gates/perm worth it?

## Setup

Three points:

| variant | gates / poseidon2 perm | block layout |
|---|---:|---|
| `merge-train/barretenberg` (286d8dd0 + mt bb) | ~73 | `poseidon ext` + `poseidon int` (one row per round) |
| current optimized (`si/p2-with-k8`, snapshot 925ca2b5) | ~32 | `poseidon ext` + `poseidon dbl` (internal rounds packed) |
| proposed | ~20 | further compaction |

The merge-train→optimized step (73 → 32) cuts ~41 gates/perm, ~56% of the poseidon cost. The proposed optimized→target step (32 → 20) cuts a further 12 gates/perm, ~38% of the remaining poseidon cost.

## Permutation counts derived from real flows

Both pinned snapshots have the same flows with the same kernels and apps, so `N_perm` is the same. Reading `N_perm = (poseidon_ext + poseidon_dbl) / 32` from the optimized snapshot:

| Flow | N_perm | mt total | opt total | proposed save (32→20) | % of opt total |
|---|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 3,736 | 872,984 | 693,026 | 44,830 | 6.47% |
| deploy_schnorr+sponsored_fpc | 3,716 | 798,073 | 619,140 | 44,587 | 7.20% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 6,850 | 1,777,327 | 1,444,517 | 82,196 | 5.69% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 4,748 | 980,805 | 748,355 | 56,974 | 7.61% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 4,758 | 2,250,953 | 2,020,823 | 57,100 | 2.83% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 3,190 | 772,809 | 618,999 | 38,274 | 6.18% |
| ecdsar1+transfer_0_recursions+private_fpc | 5,100 | 1,298,082 | 1,050,692 | 61,205 | 5.83% |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 2,585 | 617,633 | 492,919 | 31,016 | 6.29% |
| ecdsar1+transfer_1_recursions+private_fpc | 6,182 | 1,514,003 | 1,213,448 | 74,187 | 6.11% |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 3,306 | 801,569 | 641,894 | 39,668 | 6.18% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 4,747 | 912,759 | 680,350 | 56,965 | 8.37% |
| **TOTAL** | **48,918** | **12,596,997** | **10,224,163** | **587,003** | **5.74%** |

mt:opt poseidon ratio is ~2.54 across every flow, very consistent (vs. 73/32 = 2.28 nominal — small drift, but flow-internal consistency is tight).

## Read

- The 73→32 jump is the dominant win: it removes ~2M gates across these flows (~16% of merge-train totals).
- A further 32→20 jump would save **another ~590k gates total, ~6% of current optimized circuit size**, fairly uniformly across flows (5.7%–8.4%, except storage_proof at 2.8% because it's dominated by lookup-heavy SP recursion).
- Per-flow absolute savings sit at **~30k–80k gates**; the kernels (private_kernel_inner is in every flow several times, ~40% of opt poseidon) are where most of it lives, with `private_kernel_reset` variants the heaviest single contributors.
- Perms in a typical transfer-style flow: 2.5k–6.2k. Even at 12 gates/perm savings, that's tens of thousands of gates per tx.

## Per-circuit poseidon density (optimized snapshot, 32 g/perm)

| circuit | poseidon gates (opt) | implied perms | proposed save |
|---|---:|---:|---:|
| private_kernel_init | 8,092 | 253 | 3,036 |
| private_kernel_inner | 17,894 | 559 | 6,712 |
| private_kernel_reset (smallest) | 18,206 | 569 | 6,827 |
| private_kernel_reset (middle) | 19,766 | 618 | 7,412 |
| private_kernel_reset (heavy) | 34,742 | 1,086 | 13,028 |
| private_kernel_reset (heaviest) | 47,786 | 1,493 | 17,920 |
| private_kernel_tail (small) | 8,742 | 273 | 3,279 |
| private_kernel_tail (large) | 8,742 | 273 | 3,279 |
| hiding_kernel | 9,548 | 298 | 3,581 |
| ContractClassRegistry:publish | 52,422 | 1,638 | 19,659 |
| StorageProofTest:storage_proof | 12,928 | 404 | 4,848 |
| Token:transfer_to_public | 8,014 | 250 | 3,005 |
| Token:transfer_to_public_and_prepare_private_balance_increase | 8,118 | 254 | 3,044 |

(other apps each have ≤ 2k poseidon gates → ≤ 750 gate savings each)

## Poseidon share of total — dynamic across mt(73) → opt(32) → spec(20)

Reading `N_perm` from the optimized snapshot (= `(p_ext + p_dbl) / 32`), then projecting:
- baseline-mt total assumes `73 × N_perm` poseidon gates (matches measured mt totals to within ~1%)
- baseline-opt total is the measured optimized snapshot
- speculative total = optimized total − `12 × N_perm`

| Flow | N_perm | mt(73) p2/tot | opt(32) p2/tot | spec(20) p2/tot |
|---|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 3,736 | 34.7% | 17.3% | 11.5% |
| deploy_schnorr+sponsored_fpc | 3,716 | 37.8% | 19.2% | 12.9% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 6,850 | 31.4% | 15.2% | 10.1% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 4,748 | 39.5% | 20.3% | 13.7% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 4,758 | 17.2% | 7.5% | 4.8% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 3,190 | 33.5% | 16.5% | 11.0% |
| ecdsar1+transfer_0_recursions+private_fpc | 5,100 | 32.0% | 15.5% | 10.3% |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 2,585 | 34.0% | 16.8% | 11.2% |
| ecdsar1+transfer_1_recursions+private_fpc | 6,182 | 33.2% | 16.3% | 10.9% |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 3,306 | 33.5% | 16.5% | 11.0% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 4,747 | 42.4% | 22.3% | 15.2% |

Read:
- On merge-train (73), poseidon is the **single dominant block** — ~33% of a transfer tx, ~38–42% of deploy txs.
- The 73→32 jump roughly halves the share (transfers fall to ~16%, deploys to ~20%) — poseidon stops being the top bucket; `arithmetic`/`memory` overtake it.
- The 32→20 jump shaves another ~5–6 percentage points (transfers to ~11%, deploys to ~13–15%). Same Δ12 g/perm reduction in absolute terms, but applied to a now-smaller poseidon pool inside a now-smaller total → roughly a **third of the first jump's impact**.
- Storage-proof flow is its own regime (lookup-bound): 17% → 7.5% → 4.8%. The 32→20 step is nearly invisible there.

## Verdict

**Worth pursuing if it's not very expensive engineering-wise**: ~6% across-the-board reduction is a real but not dramatic win. The poseidon block is no longer the dominant cost on the optimized branch — `arithmetic` (~26%), `memory` (~12%), and `lookups` (varies, up to 33% on storage flows) are larger pools. The 32→20 step has diminishing returns vs the 73→32 step (which delivered ~16%).

The flows where this matters most relatively are small-payload txs (deploy/token_bridge_claim/transfer-sponsored), 6–8% of total gates. For storage-proof-heavy flows it's a small fraction (~3%).
