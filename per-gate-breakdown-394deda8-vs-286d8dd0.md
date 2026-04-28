# Per-gate breakdown: `394deda8` (K=8 + ext-compressed) vs `286d8dd0` (uncompressed merge-train baseline)

Both pinned IVC-input snapshots (`bb-chonk-inputs-<hash>.tar.gz`) probed with `bb gates --scheme chonk` per step.

**394deda8** = current `si/p2-with-k8` branch with 4-wire-K=8 internal + 2-per-row external Poseidon2 compression. Block summary collapses external + internal into a single `p2` column.

**286d8dd0** = pinned IVC inputs from a newer merge-train snapshot, run with merge-train bb. **No Poseidon2 compression** — the relations still consume one row per round (separate `p_ext` and `p_int` columns); for direct comparison we report `p2 = p_ext + p_int`. This is essentially the same algebraic layout as the 925ca2b5 baseline; the totals are larger only because the kernel circuits themselves have more Poseidon2 work in this newer snapshot.

286d8dd0 numbers come from `per-gate-breakdown-286d8dd0-vs-925ca2b5.md` (kernels and apps both via merge-train bb).

## App circuits — direct comparison

| Circuit | total 286 | total 394 | Δ total | arith Δ | dr Δ | ell Δ | mem Δ | nnf Δ | lkp Δ | busr Δ | p2 286 | p2 394 | Δ p2 | ecc_op Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AMM:add_liquidity | 12005 | 8276 | -3729 | +1 | +0 | +0 | +0 | +0 | +0 | +0 | 1800 | 897 | -903 | +0 |
| ContractClassRegistry:publish | 245701 | 136833 | -108868 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 52422 | 26208 | -26214 | +0 |
| ContractInstanceRegistry:publish_for_public_execution | 7442 | 6574 | -868 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 422 | 208 | -214 | +0 |
| EcdsaRAccount:constructor | 38036 | 34198 | -3838 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 1852 | 923 | -929 | +0 |
| EcdsaRAccount:entrypoint | 120577 | 118899 | -1678 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 812 | 403 | -409 | +0 |
| EcdsaRAccount:verify_private_authwit | 80447 | 80011 | -436 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 214 | 104 | -110 | +0 |
| FPC:fee_entrypoint_private | 11459 | 8054 | -3405 | +1 | +0 | +0 | +0 | +0 | +0 | +0 | 1644 | 819 | -825 | +0 |
| MultiCallEntrypoint:entrypoint | 44739 | 44141 | -598 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 292 | 143 | -149 | +0 |
| SchnorrAccount:constructor | 31171 | 28629 | -2542 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 1228 | 611 | -617 | +0 |
| SchnorrAccount:entrypoint | 52531 | 50907 | -1624 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 786 | 390 | -396 | +0 |
| SponsoredFPC:sponsor_unconditionally | 5510 | 5506 | -4 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 6 | 0 | -6 | +0 |
| StorageProofTest:storage_proof | 116706 | 89864 | -26842 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 12928 | 6461 | -6467 | +0 |
| StorageProofTest:verify_storage_proof_path_recursively | 400295 | 397213 | -3082 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 1488 | 741 | -747 | +0 |
| Token:_recurse_subtract_balance | 71116 | 63606 | -7510 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 3620 | 1807 | -1813 | +0 |
| Token:mint_to_private | 7514 | 6592 | -922 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 448 | 221 | -227 | +0 |
| Token:prepare_private_balance_increase | 7427 | 6559 | -868 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 422 | 208 | -214 | +0 |
| Token:transfer | 40566 | 37430 | -3136 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 1514 | 754 | -760 | +0 |
| Token:transfer_to_public | 165133 | 148497 | -16636 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 8014 | 4004 | -4010 | +0 |
| Token:transfer_to_public_and_prepare_private_balance_increase | 175393 | 158541 | -16852 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 8118 | 4056 | -4062 | +0 |
| TokenBridge:claim_private | 37633 | 32393 | -5240 | +2 | +0 | +0 | +0 | +0 | +0 | +0 | 2528 | 1261 | -1267 | +0 |

## Kernel circuits — variant-aligned comparison

Variants matched by basename and total-size rank.

| Circuit (286 / 394) | total 286 | total 394 | Δ total | arith 286 | arith 394 | Δ arith | p2 286 | p2 394 | Δ p2 | mem Δ | dr Δ | busr Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hiding_kernel #1 / hiding_kernel (a429d4) | 39227 | 20994 | -18233 | 10991 | 11845 | +854 | 24191 | 4992 | -19199 | +0 | +82 | +0 |
| hiding_kernel #2 / hiding_kernel (48469a) | 42411 | 24178 | -18233 | 12624 | 13478 | +854 | 24191 | 4992 | -19199 | +0 | +82 | +0 |
| private_kernel_init / private_kernel_init | 47289 | 32080 | -15209 | 18801 | 19655 | +854 | 20439 | 4264 | -16175 | +0 | +82 | +0 |
| private_kernel_inner / private_kernel_inner | 102850 | 68892 | -33958 | 39034 | 40749 | +1715 | 45296 | 9399 | -35897 | +0 | +164 | +0 |
| private_kernel_reset #1 / private_kernel_reset (91f26e) | 113025 | 76811 | -36214 | 40656 | 41511 | +855 | 46502 | 9321 | -37181 | +0 | +82 | +0 |
| private_kernel_reset #2 / private_kernel_reset (4c1b2a) | 122995 | 83541 | -39454 | 45056 | 45911 | +855 | 50522 | 10101 | -40421 | +0 | +82 | +0 |
| private_kernel_reset #3 / private_kernel_reset (7f9f1e) | 178223 | 107665 | -70558 | 57279 | 58134 | +855 | 89114 | 17589 | -71525 | +0 | +82 | +0 |
| private_kernel_reset #4 / private_kernel_reset (e96e81) | 220178 | 122404 | -97774 | 64239 | 65094 | +855 | 122882 | 24141 | -98741 | +0 | +82 | +0 |
| private_kernel_tail #1 / private_kernel_tail (316f3d) | 45739 | 29179 | -16560 | 17876 | 18731 | +855 | 22114 | 4589 | -17525 | +0 | +82 | +0 |
| private_kernel_tail #2 / private_kernel_tail (c4036b) | 90300 | 73740 | -16560 | 42368 | 43223 | +855 | 22114 | 4589 | -17525 | +0 | +82 | +0 |

## Per-flow grand totals comparison

| Flow | 286 total | 394 total | Δ | 286 app | 394 app | Δ app | 286 ker | 394 ker | Δ ker |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 872984 | 643950 | -229034 | 216304 | 209318 | -6986 | 656680 | 434632 | -222048 |
| deploy_schnorr+sponsored_fpc | 798073 | 570389 | -227684 | 141393 | 135757 | -5636 | 656680 | 434632 | -222048 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 1777327 | 1350990 | -426337 | 657199 | 616344 | -40855 | 1120128 | 734646 | -385482 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 980805 | 681297 | -299508 | 379230 | 267812 | -111418 | 601575 | 413485 | -188090 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 2250953 | 1957177 | -293776 | 1443678 | 1405908 | -37770 | 807275 | 551269 | -256006 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 772809 | 576875 | -195934 | 171234 | 163390 | -7844 | 601575 | 413485 | -188090 |
| ecdsar1+transfer_0_recursions+private_fpc | 1298082 | 981573 | -316509 | 425609 | 399450 | -26159 | 872473 | 582123 | -290350 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 617633 | 458683 | -158950 | 166653 | 161835 | -4818 | 450980 | 296848 | -154132 |
| ecdsar1+transfer_1_recursions+private_fpc | 1514003 | 1128810 | -385193 | 496725 | 463056 | -33669 | 1017278 | 665754 | -351524 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 801569 | 597911 | -203658 | 237769 | 225441 | -12328 | 563800 | 372470 | -191330 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 912759 | 613305 | -299454 | 311184 | 199820 | -111364 | 601575 | 413485 | -188090 |

## Per-flow per-block deltas (394 − 286)

Side-by-side aggregates for each flow, app + kernel.

| Flow | side | total Δ | arith Δ | dr Δ | ell Δ | mem Δ | nnf Δ | lkp Δ | busr Δ | p2 286 | p2 394 | Δ p2 | ecc_op Δ |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | app | -6986 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 8663 | 1677 | -6986 | +0 |
| deploy_ecdsar1+sponsored_fpc | kernel | -222048 | +10278 | +984 | +0 | +0 | +0 | +0 | +0 | 294430 | 60762 | -233668 | +358 |
| deploy_schnorr+sponsored_fpc | app | -5636 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 6988 | 1352 | -5636 | +0 |
| deploy_schnorr+sponsored_fpc | kernel | -222048 | +10278 | +984 | +0 | +0 | +0 | +0 | +0 | 294430 | 60762 | -233668 | +358 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | app | -40855 | +1 | +0 | +0 | +0 | +0 | +0 | +0 | 50684 | 9828 | -40856 | +0 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | kernel | -385482 | +15423 | +1476 | +0 | +0 | +0 | +0 | +0 | 506698 | 103779 | -402919 | +538 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | app | -111418 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 138237 | 26819 | -111418 | +0 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | kernel | -188090 | +8563 | +820 | +0 | +0 | +0 | +0 | +0 | 249134 | 51363 | -197771 | +298 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | app | -37770 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 46857 | 9087 | -37770 | +0 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | kernel | -256006 | +11993 | +1148 | +0 | +0 | +0 | +0 | +0 | 339726 | 70161 | -269565 | +418 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | app | -7844 | +2 | +0 | +0 | +0 | +0 | +0 | +0 | 9731 | 1885 | -7846 | +0 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | kernel | -188090 | +8563 | +820 | +0 | +0 | +0 | +0 | +0 | 249134 | 51363 | -197771 | +298 |
| ecdsar1+transfer_0_recursions+private_fpc | app | -26159 | +1 | +0 | +0 | +0 | +0 | +0 | +0 | 32452 | 6292 | -26160 | +0 |
| ecdsar1+transfer_0_recursions+private_fpc | kernel | -290350 | +11993 | +1148 | +0 | +0 | +0 | +0 | +0 | 382338 | 78429 | -303909 | +418 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | app | -4818 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 5975 | 1157 | -4818 | +0 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | kernel | -154132 | +6848 | +656 | +0 | +0 | +0 | +0 | +0 | 203838 | 41964 | -161874 | +238 |
| ecdsar1+transfer_1_recursions+private_fpc | app | -33669 | +1 | +0 | +0 | +0 | +0 | +0 | +0 | 41769 | 8099 | -33670 | +0 |
| ecdsar1+transfer_1_recursions+private_fpc | kernel | -351524 | +13708 | +1312 | +0 | +0 | +0 | +0 | +0 | 461402 | 94380 | -367022 | +478 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | app | -12328 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 15292 | 2964 | -12328 | +0 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | kernel | -191330 | +8563 | +820 | +0 | +0 | +0 | +0 | +0 | 253154 | 52143 | -201011 | +298 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | app | -111364 | +0 | +0 | +0 | +0 | +0 | +0 | +0 | 138170 | 26806 | -111364 | +0 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | kernel | -188090 | +8563 | +820 | +0 | +0 | +0 | +0 | +0 | 249134 | 51363 | -197771 | +298 |