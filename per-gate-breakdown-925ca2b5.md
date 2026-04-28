# Per-gate-type breakdown — chonk inputs `bb-chonk-inputs-925ca2b5.tar.gz`

Source: pinned IVC inputs at short hash `925ca2b5`. Block sizes obtained by running `bb gates --scheme chonk` on each step bytecode extracted from `ivc-inputs.msgpack`.

Block names match `MegaExecutionTraceBlocks::summarize()` (mega_execution_trace.hpp). `pub inputs` is reported as 0 here — it is populated later in the decider pk constructor and not visible at finalize time.

## Unique circuits (deduplicated by bytecode hash)

| Circuit | role | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hiding_kernel (0e3b7f) | kernel | 24883 | 11273 | 2487 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| hiding_kernel (43c6d5) | kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| private_kernel_init | kernel | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| private_kernel_inner | kernel | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| private_kernel_reset (82dda8) | kernel | 124151 | 57562 | 5496 | 1338 | 21330 | 2 | 2 | 3463 | 13362 | 21380 | 182 |
| private_kernel_reset (86f7fd) | kernel | 92539 | 45339 | 5379 | 1338 | 17058 | 2 | 2 | 3439 | 7602 | 12164 | 182 |
| private_kernel_reset (c4ee6b) | kernel | 145442 | 64522 | 5523 | 1338 | 22506 | 2 | 2 | 3487 | 18402 | 29444 | 182 |
| private_kernel_reset (ee03d4) | kernel | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| private_kernel_tail (bfd02b) | kernel | 32665 | 18159 | 3322 | 2 | 797 | 2 | 2 | 1415 | 3362 | 5380 | 190 |
| private_kernel_tail (f3d8ab) | kernel | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| AMM:add_liquidity | app | 9179 | 4413 | 1579 | 338 | 163 | 2 | 2 | 873 | 692 | 1108 | 0 |
| ContractClassRegistry:publish | app | 163047 | 74332 | 17305 | 2 | 18100 | 2 | 2 | 873 | 20162 | 32260 | 0 |
| ContractInstanceRegistry:publish_for_public_execution | app | 6788 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| EcdsaRAccount:constructor | app | 35127 | 17680 | 1912 | 1678 | 807 | 2 | 10314 | 873 | 712 | 1140 | 0 |
| EcdsaRAccount:entrypoint | app | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| EcdsaRAccount:verify_private_authwit | app | 80121 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 82 | 132 | 0 |
| FPC:fee_entrypoint_private | app | 8879 | 4289 | 1559 | 338 | 163 | 2 | 2 | 873 | 632 | 1012 | 0 |
| MultiCallEntrypoint:entrypoint | app | 44290 | 5351 | 4165 | 2 | 33594 | 2 | 2 | 873 | 112 | 180 | 0 |
| SchnorrAccount:constructor | app | 29246 | 14677 | 1834 | 1678 | 807 | 2 | 8138 | 873 | 472 | 756 | 0 |
| SchnorrAccount:entrypoint | app | 51303 | 8260 | 4381 | 810 | 34106 | 2 | 2076 | 873 | 302 | 484 | 0 |
| SponsoredFPC:sponsor_unconditionally | app | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| StorageProofTest:storage_proof | app | 96331 | 37518 | 12977 | 2 | 3372 | 2 | 28650 | 873 | 4972 | 7956 | 0 |
| StorageProofTest:verify_storage_proof_path_recursively | app | 397960 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 572 | 916 | 0 |
| Token:_recurse_subtract_balance | app | 65419 | 19669 | 4929 | 2690 | 33625 | 2 | 2 | 873 | 1392 | 2228 | 0 |
| Token:mint_to_private | app | 6819 | 3527 | 1457 | 338 | 163 | 2 | 2 | 873 | 172 | 276 | 0 |
| Token:prepare_private_balance_increase | app | 6773 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| Token:transfer | app | 38190 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 582 | 932 | 0 |
| Token:transfer_to_public | app | 152507 | 48358 | 9077 | 6382 | 72742 | 2 | 7050 | 873 | 3082 | 4932 | 0 |
| Token:transfer_to_public_and_prepare_private_balance_increase | app | 162603 | 49067 | 9869 | 6382 | 81233 | 2 | 7050 | 873 | 3122 | 4996 | 0 |
| TokenBridge:claim_private | app | 33660 | 13234 | 2031 | 338 | 163 | 2 | 14482 | 873 | 972 | 1556 | 0 |

## Per-flow totals: app vs kernel

Sums of block sizes across all steps in the flow, split by app circuit vs kernel circuit (kernels = `private_kernel_*` and `hiding_kernel`).

| Flow | side | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | app | 211025 | 70215 | 28182 | 2022 | 70755 | 18839 | 13218 | 4365 | 1300 | 2084 | 0 |
| deploy_ecdsar1+sponsored_fpc | kernel | 482001 | 247850 | 35653 | 3032 | 56430 | 16 | 16 | 19056 | 44676 | 71488 | 2236 |
| deploy_schnorr+sponsored_fpc | app | 137139 | 35006 | 13257 | 2830 | 68672 | 10 | 10220 | 4365 | 1050 | 1684 | 0 |
| deploy_schnorr+sponsored_fpc | kernel | 482001 | 247850 | 35653 | 3032 | 56430 | 16 | 16 | 19056 | 44676 | 71488 | 2236 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | app | 626220 | 226141 | 76391 | 13448 | 204177 | 56503 | 22800 | 6984 | 7576 | 12128 | 0 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | kernel | 818297 | 416355 | 53876 | 4046 | 108384 | 22 | 22 | 29643 | 76722 | 122764 | 3310 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | app | 294655 | 121516 | 39410 | 344 | 54454 | 18837 | 2904 | 3492 | 20638 | 33024 | 0 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | kernel | 453700 | 234376 | 31514 | 2694 | 64248 | 14 | 14 | 17675 | 37794 | 60476 | 1878 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | app | 1415031 | 395882 | 94031 | 12 | 197051 | 18841 | 685712 | 5238 | 7002 | 11208 | 0 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | kernel | 605792 | 313574 | 42368 | 3370 | 83240 | 18 | 18 | 23467 | 51558 | 82500 | 2594 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | app | 165299 | 60419 | 24140 | 680 | 36517 | 18837 | 17384 | 3492 | 1458 | 2336 | 0 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | kernel | 453700 | 234376 | 31514 | 2694 | 64248 | 14 | 14 | 17675 | 37794 | 60476 | 1878 |
| ecdsar1+transfer_0_recursions+private_fpc | app | 405778 | 143249 | 51535 | 8072 | 134488 | 37670 | 12852 | 5238 | 4852 | 7768 | 0 |
| ecdsar1+transfer_0_recursions+private_fpc | kernel | 644914 | 330197 | 42995 | 3370 | 88216 | 18 | 18 | 23827 | 57918 | 92676 | 2594 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | app | 163010 | 52071 | 24385 | 1014 | 58825 | 18835 | 2902 | 2619 | 896 | 1436 | 0 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | kernel | 329909 | 168652 | 24799 | 2356 | 37438 | 12 | 12 | 13264 | 30912 | 49464 | 1520 |
| ecdsar1+transfer_1_recursions+private_fpc | app | 471197 | 162918 | 56464 | 10762 | 168113 | 37672 | 12854 | 6111 | 6244 | 9996 | 0 |
| ecdsar1+transfer_1_recursions+private_fpc | kernel | 742251 | 376756 | 48449 | 3708 | 98888 | 20 | 20 | 26747 | 69840 | 111752 | 2952 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | app | 228429 | 71740 | 29314 | 3704 | 92450 | 18837 | 2904 | 3492 | 2288 | 3664 | 0 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | kernel | 413465 | 212651 | 30736 | 2694 | 47638 | 14 | 14 | 16496 | 38394 | 61436 | 1878 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | app | 226650 | 89310 | 24563 | 1152 | 52371 | 8 | 2082 | 3492 | 20628 | 33008 | 0 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | kernel | 453700 | 234376 | 31514 | 2694 | 64248 | 14 | 14 | 17675 | 37794 | 60476 | 1878 |

## Per-step breakdown per flow

### deploy_ecdsar1+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | MultiCallEntrypoint:entrypoint | 44290 | 5351 | 4165 | 2 | 33594 | 2 | 2 | 873 | 112 | 180 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | ContractInstanceRegistry:publish_for_public_execution | 6788 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | EcdsaRAccount:constructor | 35127 | 17680 | 1912 | 1678 | 807 | 2 | 10314 | 873 | 712 | 1140 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 9 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 10 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 11 | kernel | private_kernel_tail | 32665 | 18159 | 3322 | 2 | 797 | 2 | 2 | 1415 | 3362 | 5380 | 190 |
| 12 | kernel | hiding_kernel | 24883 | 11273 | 2487 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **693026** | **318065** | **63835** | **5054** | **127185** | **18855** | **13234** | **23421** | **45976** | **73572** | **2236** |

### deploy_schnorr+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | MultiCallEntrypoint:entrypoint | 44290 | 5351 | 4165 | 2 | 33594 | 2 | 2 | 873 | 112 | 180 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | ContractInstanceRegistry:publish_for_public_execution | 6788 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | SchnorrAccount:constructor | 29246 | 14677 | 1834 | 1678 | 807 | 2 | 8138 | 873 | 472 | 756 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | SchnorrAccount:entrypoint | 51303 | 8260 | 4381 | 810 | 34106 | 2 | 2076 | 873 | 302 | 484 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 9 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 10 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 11 | kernel | private_kernel_tail | 32665 | 18159 | 3322 | 2 | 797 | 2 | 2 | 1415 | 3362 | 5380 | 190 |
| 12 | kernel | hiding_kernel | 24883 | 11273 | 2487 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **619140** | **282856** | **48910** | **5862** | **125102** | **26** | **10236** | **23421** | **45726** | **73172** | **2236** |

### ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | AMM:add_liquidity | 9179 | 4413 | 1579 | 338 | 163 | 2 | 2 | 873 | 692 | 1108 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | Token:transfer_to_public_and_prepare_private_balance_increase | 162603 | 49067 | 9869 | 6382 | 81233 | 2 | 7050 | 873 | 3122 | 4996 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | app | EcdsaRAccount:verify_private_authwit | 80121 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 82 | 132 | 0 |
| 9 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 10 | app | Token:transfer_to_public_and_prepare_private_balance_increase | 162603 | 49067 | 9869 | 6382 | 81233 | 2 | 7050 | 873 | 3122 | 4996 | 0 |
| 11 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 12 | app | EcdsaRAccount:verify_private_authwit | 80121 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 82 | 132 | 0 |
| 13 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 14 | app | Token:prepare_private_balance_increase | 6773 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 15 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 16 | kernel | private_kernel_reset | 145442 | 64522 | 5523 | 1338 | 22506 | 2 | 2 | 3487 | 18402 | 29444 | 182 |
| 17 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 18 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **1444517** | **642496** | **130267** | **17494** | **312561** | **56525** | **22822** | **36627** | **84298** | **134892** | **3310** |

### ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | ContractClassRegistry:publish | 163047 | 74332 | 17305 | 2 | 18100 | 2 | 2 | 873 | 20162 | 32260 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | ContractInstanceRegistry:publish_for_public_execution | 6788 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 9 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 10 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **748355** | **355892** | **70924** | **3038** | **118702** | **18851** | **2918** | **21167** | **58432** | **93500** | **1878** |

### ecdsar1+storage_proof_7_layers+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | StorageProofTest:storage_proof | 96331 | 37518 | 12977 | 2 | 3372 | 2 | 28650 | 873 | 4972 | 7956 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | StorageProofTest:verify_storage_proof_path_recursively | 397960 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 572 | 916 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | app | StorageProofTest:verify_storage_proof_path_recursively | 397960 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 572 | 916 | 0 |
| 9 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 10 | app | StorageProofTest:verify_storage_proof_path_recursively | 397960 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 572 | 916 | 0 |
| 11 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 12 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 13 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 14 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **2020823** | **709456** | **136399** | **3382** | **280291** | **18859** | **685730** | **28705** | **58560** | **93708** | **2594** |

### ecdsar1+token_bridge_claim_private+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | TokenBridge:claim_private | 33660 | 13234 | 2031 | 338 | 163 | 2 | 14482 | 873 | 972 | 1556 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | Token:mint_to_private | 6819 | 3527 | 1457 | 338 | 163 | 2 | 2 | 873 | 172 | 276 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 9 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 10 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **618999** | **294795** | **55654** | **3374** | **100765** | **18851** | **17398** | **21167** | **39252** | **62812** | **1878** |

### ecdsar1+transfer_0_recursions+private_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | FPC:fee_entrypoint_private | 8879 | 4289 | 1559 | 338 | 163 | 2 | 2 | 873 | 632 | 1012 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | Token:transfer_to_public | 152507 | 48358 | 9077 | 6382 | 72742 | 2 | 7050 | 873 | 3082 | 4932 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | EcdsaRAccount:verify_private_authwit | 80121 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 82 | 132 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | app | Token:prepare_private_balance_increase | 6773 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 9 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 10 | app | Token:transfer | 38190 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 582 | 932 | 0 |
| 11 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 12 | kernel | private_kernel_reset | 124151 | 57562 | 5496 | 1338 | 21330 | 2 | 2 | 3463 | 13362 | 21380 | 182 |
| 13 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 14 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **1050692** | **473446** | **94530** | **11442** | **222704** | **37688** | **12870** | **29065** | **62770** | **100444** | **2594** |

### ecdsar1+transfer_0_recursions+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | Token:transfer | 38190 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 582 | 932 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 7 | kernel | private_kernel_tail | 32665 | 18159 | 3322 | 2 | 797 | 2 | 2 | 1415 | 3362 | 5380 | 190 |
| 8 | kernel | hiding_kernel | 24883 | 11273 | 2487 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **492919** | **220723** | **49184** | **3370** | **96263** | **18847** | **2914** | **15883** | **31808** | **50900** | **1520** |

### ecdsar1+transfer_1_recursions+private_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | FPC:fee_entrypoint_private | 8879 | 4289 | 1559 | 338 | 163 | 2 | 2 | 873 | 632 | 1012 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | Token:transfer_to_public | 152507 | 48358 | 9077 | 6382 | 72742 | 2 | 7050 | 873 | 3082 | 4932 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | EcdsaRAccount:verify_private_authwit | 80121 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 82 | 132 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | app | Token:prepare_private_balance_increase | 6773 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 9 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 10 | app | Token:transfer | 38190 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 582 | 932 | 0 |
| 11 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 12 | app | Token:_recurse_subtract_balance | 65419 | 19669 | 4929 | 2690 | 33625 | 2 | 2 | 873 | 1392 | 2228 | 0 |
| 13 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 14 | kernel | private_kernel_reset | 145442 | 64522 | 5523 | 1338 | 22506 | 2 | 2 | 3487 | 18402 | 29444 | 182 |
| 15 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 16 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **1213448** | **539674** | **104913** | **14470** | **267001** | **37692** | **12874** | **32858** | **76084** | **121748** | **2952** |

### ecdsar1+transfer_1_recursions+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 119308 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 312 | 500 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | Token:transfer | 38190 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 582 | 932 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | Token:_recurse_subtract_balance | 65419 | 19669 | 4929 | 2690 | 33625 | 2 | 2 | 873 | 1392 | 2228 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | kernel | private_kernel_reset | 92539 | 45339 | 5379 | 1338 | 17058 | 2 | 2 | 3439 | 7602 | 12164 | 182 |
| 9 | kernel | private_kernel_tail | 32665 | 18159 | 3322 | 2 | 797 | 2 | 2 | 1415 | 3362 | 5380 | 190 |
| 10 | kernel | hiding_kernel | 24883 | 11273 | 2487 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **641894** | **284391** | **60050** | **6398** | **140088** | **18851** | **2918** | **19988** | **40682** | **65100** | **1878** |

### schnorr+deploy_tokenContract_with_registration+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | poseidon_ext | poseidon_dbl | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | SchnorrAccount:entrypoint | 51303 | 8260 | 4381 | 810 | 34106 | 2 | 2076 | 873 | 302 | 484 | 0 |
| 1 | kernel | private_kernel_init | 35240 | 19083 | 3267 | 338 | 1293 | 2 | 2 | 2951 | 3112 | 4980 | 178 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5512 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 2 | 4 | 0 |
| 3 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 4 | app | ContractClassRegistry:publish | 163047 | 74332 | 17305 | 2 | 18100 | 2 | 2 | 873 | 20162 | 32260 | 0 |
| 5 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 6 | app | ContractInstanceRegistry:publish_for_public_execution | 6788 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 162 | 260 | 0 |
| 7 | kernel | private_kernel_inner | 76046 | 39599 | 5427 | 338 | 9496 | 2 | 2 | 2896 | 6882 | 11012 | 358 |
| 8 | kernel | private_kernel_reset | 85029 | 40939 | 4869 | 1338 | 16354 | 2 | 2 | 3103 | 7002 | 11204 | 182 |
| 9 | kernel | private_kernel_tail | 77226 | 42651 | 4562 | 2 | 18111 | 2 | 2 | 2930 | 3362 | 5380 | 190 |
| 10 | kernel | hiding_kernel | 28067 | 12906 | 2535 | 2 | 2 | 2 | 2 | 3 | 3672 | 5876 | 254 |
| | **total** | | **680350** | **323686** | **56077** | **3846** | **116619** | **22** | **2096** | **21167** | **58422** | **93484** | **1878** |
