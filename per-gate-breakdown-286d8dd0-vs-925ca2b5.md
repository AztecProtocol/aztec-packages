# Per-gate breakdown: current branch pinned `286d8dd0` vs `925ca2b5`

Both pinned IVC-input snapshots (`bb-chonk-inputs-<hash>.tar.gz`) probed with `bb gates --scheme chonk` per step.

Tooling: `bb` was built from a clean worktree at `origin/merge-train/barretenberg` (commit f3c8e9c60d4). All 286d8dd0 circuits run with this binary. For 925ca2b5, **apps** also run with merge-train `bb` so the comparison is apples-to-apples. The 925ca2b5 **kernel circuits** are not compatible with current `bb` (assertion `size() == max_size_impl(...)` fails, 127 vs 139 — kernel public-input layout has grown), so 925ca2b5 kernel numbers shown are the ones reported by the older locally-built `bb` and are kept for reference only.

Block-name change: old `bb` printed `poseidon dbl`; merge-train `bb` prints `poseidon int` (same internal-round block, renamed).

## App circuits — direct comparison (merge-train bb on both snapshots)

| Circuit | total 925 | total 286 | Δ total | arith Δ | dr Δ | ell Δ | mem Δ | nnf Δ | lkp Δ | busr Δ | p_ext Δ | p_int Δ | ecc_op Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AMM:add_liquidity | 12006 | 12005 | -1 | -1 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| ContractClassRegistry:publish | 245701 | 245701 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| ContractInstanceRegistry:publish_for_public_execution | 7442 | 7442 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| EcdsaRAccount:constructor | 38036 | 38036 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| EcdsaRAccount:entrypoint | 120577 | 120577 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| EcdsaRAccount:verify_private_authwit | 80447 | 80447 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| FPC:fee_entrypoint_private | 11460 | 11459 | -1 | -1 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| MultiCallEntrypoint:entrypoint | 44739 | 44739 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| SchnorrAccount:constructor | 31171 | 31171 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| SchnorrAccount:entrypoint | 52531 | 52531 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| SponsoredFPC:sponsor_unconditionally | 5510 | 5510 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| StorageProofTest:storage_proof | 116706 | 116706 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| StorageProofTest:verify_storage_proof_path_recursively | 400295 | 400295 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| Token:_recurse_subtract_balance | 71116 | 71116 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| Token:mint_to_private | 7514 | 7514 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| Token:prepare_private_balance_increase | 7427 | 7427 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| Token:transfer | 40566 | 40566 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| Token:transfer_to_public | 165133 | 165133 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| Token:transfer_to_public_and_prepare_private_balance_increase | 175393 | 175393 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |
| TokenBridge:claim_private | 37635 | 37633 | -2 | -2 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | +0 |

## Kernel circuits — 286d8dd0 (merge-train bb) vs 925ca2b5 (old bb, reference)

Cross-snapshot deltas are **not strictly meaningful** here because the two columns were produced by different `bb` binaries. The 286 column reflects the actual kernel as it exists on `merge-train/barretenberg` today.

| Circuit (variant) | 925 total (old bb) | 286 total (mt bb) | arith 286 | dr 286 | ell 286 | mem 286 | lkp 286 | busr 286 | p_ext 286 | p_int 286 | ecc_op 286 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hiding_kernel #1 | 24883 | 39227 | 10991 | 2476 | 2 | 2 | 2 | 3 | 3612 | 20579 | 248 |
| hiding_kernel #2 | 28067 | 42411 | 12624 | 2524 | 2 | 2 | 2 | 3 | 3612 | 20579 | 248 |
| private_kernel_init | 35240 | 47289 | 18801 | 3257 | 338 | 1293 | 2 | 2951 | 3052 | 17387 | 172 |
| private_kernel_inner | 76046 | 102850 | 39034 | 5406 | 338 | 9496 | 2 | 2896 | 6762 | 38534 | 346 |
| private_kernel_reset #1 | 85029 | 113025 | 40656 | 4858 | 1338 | 16354 | 2 | 3103 | 6942 | 39560 | 176 |
| private_kernel_reset #2 | 92539 | 122995 | 45056 | 5368 | 1338 | 17058 | 2 | 3439 | 7542 | 42980 | 176 |
| private_kernel_reset #3 | 124151 | 178223 | 57279 | 5485 | 1338 | 21330 | 2 | 3463 | 13302 | 75812 | 176 |
| private_kernel_reset #4 | 145442 | 220178 | 64239 | 5512 | 1338 | 22506 | 2 | 3487 | 18342 | 104540 | 176 |
| private_kernel_tail #1 | 32665 | 45739 | 17876 | 3311 | 2 | 797 | 2 | 1415 | 3302 | 18812 | 186 |
| private_kernel_tail #2 | 77226 | 90300 | 42368 | 4551 | 2 | 18111 | 2 | 2930 | 3302 | 18812 | 186 |

## 286d8dd0 — per-flow totals (app vs kernel, merge-train bb)

| Flow | side | total | arith | dr | ell | mem | nnf | lkp | busr | p_ext | p_int | ecc_op |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | app | 216304 | 70215 | 28182 | 2022 | 70755 | 18839 | 13218 | 4365 | 1300 | 7363 | 0 |
| deploy_ecdsar1+sponsored_fpc | kernel | 656680 | 244460 | 35526 | 3032 | 56430 | 16 | 16 | 19056 | 43956 | 250474 | 2166 |
| deploy_schnorr+sponsored_fpc | app | 141393 | 35006 | 13257 | 2830 | 68672 | 10 | 10220 | 4365 | 1050 | 5938 | 0 |
| deploy_schnorr+sponsored_fpc | kernel | 656680 | 244460 | 35526 | 3032 | 56430 | 16 | 16 | 19056 | 43956 | 250474 | 2166 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | app | 657199 | 226140 | 76391 | 13448 | 204177 | 56503 | 22800 | 6984 | 7576 | 43108 | 0 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | kernel | 1120128 | 411270 | 53686 | 4046 | 108384 | 22 | 22 | 29643 | 75642 | 431056 | 3204 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | app | 379230 | 121516 | 39410 | 344 | 54454 | 18837 | 2904 | 3492 | 20638 | 117599 | 0 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | kernel | 601575 | 231551 | 31408 | 2694 | 64248 | 14 | 14 | 17675 | 37194 | 211940 | 1820 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | app | 1443678 | 395882 | 94031 | 12 | 197051 | 18841 | 685712 | 5238 | 7002 | 39855 | 0 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | kernel | 807275 | 309619 | 42220 | 3370 | 83240 | 18 | 18 | 23467 | 50718 | 289008 | 2512 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | app | 171234 | 60417 | 24140 | 680 | 36517 | 18837 | 17384 | 3492 | 1458 | 8273 | 0 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | kernel | 601575 | 231551 | 31408 | 2694 | 64248 | 14 | 14 | 17675 | 37194 | 211940 | 1820 |
| ecdsar1+transfer_0_recursions+private_fpc | app | 425609 | 143248 | 51535 | 8072 | 134488 | 37670 | 12852 | 5238 | 4852 | 27600 | 0 |
| ecdsar1+transfer_0_recursions+private_fpc | kernel | 872473 | 326242 | 42847 | 3370 | 88216 | 18 | 18 | 23827 | 57078 | 325260 | 2512 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | app | 166653 | 52071 | 24385 | 1014 | 58825 | 18835 | 2902 | 2619 | 896 | 5079 | 0 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | kernel | 450980 | 166392 | 24714 | 2356 | 37438 | 12 | 12 | 13264 | 30432 | 173406 | 1474 |
| ecdsar1+transfer_1_recursions+private_fpc | app | 496725 | 162917 | 56464 | 10762 | 168113 | 37672 | 12854 | 6111 | 6244 | 35525 | 0 |
| ecdsar1+transfer_1_recursions+private_fpc | kernel | 1017278 | 372236 | 48280 | 3708 | 98888 | 20 | 20 | 26747 | 68880 | 392522 | 2858 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | app | 237769 | 71740 | 29314 | 3704 | 92450 | 18837 | 2904 | 3492 | 2288 | 13004 | 0 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | kernel | 563800 | 209826 | 30630 | 2694 | 47638 | 14 | 14 | 16496 | 37794 | 215360 | 1820 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | app | 311184 | 89310 | 24563 | 1152 | 52371 | 8 | 2082 | 3492 | 20628 | 117542 | 0 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | kernel | 601575 | 231551 | 31408 | 2694 | 64248 | 14 | 14 | 17675 | 37194 | 211940 | 1820 |

## Per-flow grand totals comparison

| Flow | 925 total | 286 total | Δ | 925 app | 286 app | Δ app | 925 ker | 286 ker | Δ ker |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 693026 | 872984 | +179958 | 211025 | 216304 | +5279 | 482001 | 656680 | +174679 |
| deploy_schnorr+sponsored_fpc | 619140 | 798073 | +178933 | 137139 | 141393 | +4254 | 482001 | 656680 | +174679 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 1444517 | 1777327 | +332810 | 626220 | 657199 | +30979 | 818297 | 1120128 | +301831 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 748355 | 980805 | +232450 | 294655 | 379230 | +84575 | 453700 | 601575 | +147875 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 2020823 | 2250953 | +230130 | 1415031 | 1443678 | +28647 | 605792 | 807275 | +201483 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 618999 | 772809 | +153810 | 165299 | 171234 | +5935 | 453700 | 601575 | +147875 |
| ecdsar1+transfer_0_recursions+private_fpc | 1050692 | 1298082 | +247390 | 405778 | 425609 | +19831 | 644914 | 872473 | +227559 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 492919 | 617633 | +124714 | 163010 | 166653 | +3643 | 329909 | 450980 | +121071 |
| ecdsar1+transfer_1_recursions+private_fpc | 1213448 | 1514003 | +300555 | 471197 | 496725 | +25528 | 742251 | 1017278 | +275027 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 641894 | 801569 | +159675 | 228429 | 237769 | +9340 | 413465 | 563800 | +150335 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 680350 | 912759 | +232409 | 226650 | 311184 | +84534 | 453700 | 601575 | +147875 |

Note: kernel-side delta mixes a `bb` evolution effect (block accounting) with actual kernel changes between snapshots. The **app-side delta is the cleaner signal**.