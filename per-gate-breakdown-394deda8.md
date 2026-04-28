# Per-gate-type breakdown — chonk inputs `bb-chonk-inputs-394deda8.tar.gz`

Source: pinned IVC inputs at short hash `394deda8`. Block sizes obtained by running `bb gates --scheme chonk` on each step bytecode extracted from `ivc-inputs.msgpack`.

Block names match the current `MegaExecutionTraceBlocks` summary on this branch (`si/p2-with-k8`): the standard external/internal Poseidon2 blocks have been replaced by a single unified `p2_compressed` block carrying the K=8 internal + 2-per-row external compressed layout. `pub inputs` is reported as 0 here — populated later in the decider pk constructor.

## Unique circuits (deduplicated by bytecode hash)

| Circuit | role | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hiding_kernel (48469a) | kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
| hiding_kernel (a429d4) | kernel | 20994 | 11845 | 2558 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
| private_kernel_init | kernel | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| private_kernel_inner | kernel | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| private_kernel_reset (4c1b2a) | kernel | 83541 | 45911 | 5450 | 1338 | 17058 | 2 | 2 | 3439 | 10101 | 206 |
| private_kernel_reset (7f9f1e) | kernel | 107665 | 58134 | 5567 | 1338 | 21330 | 2 | 2 | 3463 | 17589 | 206 |
| private_kernel_reset (91f26e) | kernel | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| private_kernel_reset (e96e81) | kernel | 122404 | 65094 | 5594 | 1338 | 22506 | 2 | 2 | 3487 | 24141 | 206 |
| private_kernel_tail (316f3d) | kernel | 29179 | 18731 | 3393 | 2 | 797 | 2 | 2 | 1415 | 4589 | 214 |
| private_kernel_tail (c4036b) | kernel | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| AMM:add_liquidity | app | 8276 | 4413 | 1579 | 338 | 163 | 2 | 2 | 873 | 897 | 0 |
| ContractClassRegistry:publish | app | 136833 | 74332 | 17305 | 2 | 18100 | 2 | 2 | 873 | 26208 | 0 |
| ContractInstanceRegistry:publish_for_public_execution | app | 6574 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| EcdsaRAccount:constructor | app | 34198 | 17680 | 1912 | 1678 | 807 | 2 | 10314 | 873 | 923 | 0 |
| EcdsaRAccount:entrypoint | app | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| EcdsaRAccount:verify_private_authwit | app | 80011 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 104 | 0 |
| FPC:fee_entrypoint_private | app | 8054 | 4289 | 1559 | 338 | 163 | 2 | 2 | 873 | 819 | 0 |
| MultiCallEntrypoint:entrypoint | app | 44141 | 5351 | 4165 | 2 | 33594 | 2 | 2 | 873 | 143 | 0 |
| SchnorrAccount:constructor | app | 28629 | 14677 | 1834 | 1678 | 807 | 2 | 8138 | 873 | 611 | 0 |
| SchnorrAccount:entrypoint | app | 50907 | 8260 | 4381 | 810 | 34106 | 2 | 2076 | 873 | 390 | 0 |
| SponsoredFPC:sponsor_unconditionally | app | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| StorageProofTest:storage_proof | app | 89864 | 37518 | 12977 | 2 | 3372 | 2 | 28650 | 873 | 6461 | 0 |
| StorageProofTest:verify_storage_proof_path_recursively | app | 397213 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 741 | 0 |
| Token:_recurse_subtract_balance | app | 63606 | 19669 | 4929 | 2690 | 33625 | 2 | 2 | 873 | 1807 | 0 |
| Token:mint_to_private | app | 6592 | 3527 | 1457 | 338 | 163 | 2 | 2 | 873 | 221 | 0 |
| Token:prepare_private_balance_increase | app | 6559 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| Token:transfer | app | 37430 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 754 | 0 |
| Token:transfer_to_public | app | 148497 | 48358 | 9077 | 6382 | 72742 | 2 | 7050 | 873 | 4004 | 0 |
| Token:transfer_to_public_and_prepare_private_balance_increase | app | 158541 | 49067 | 9869 | 6382 | 81233 | 2 | 7050 | 873 | 4056 | 0 |
| TokenBridge:claim_private | app | 32393 | 13234 | 2031 | 338 | 163 | 2 | 14482 | 873 | 1261 | 0 |

## Per-flow totals: app vs kernel

Sums of block sizes across all steps in the flow, split by app circuit vs kernel circuit (kernels = `private_kernel_*` and `hiding_kernel`).

| Flow | side | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | app | 209318 | 70215 | 28182 | 2022 | 70755 | 18839 | 13218 | 4365 | 1677 | 0 |
| deploy_ecdsar1+sponsored_fpc | kernel | 434632 | 254738 | 36510 | 3032 | 56430 | 16 | 16 | 19056 | 60762 | 2524 |
| deploy_schnorr+sponsored_fpc | app | 135757 | 35006 | 13257 | 2830 | 68672 | 10 | 10220 | 4365 | 1352 | 0 |
| deploy_schnorr+sponsored_fpc | kernel | 434632 | 254738 | 36510 | 3032 | 56430 | 16 | 16 | 19056 | 60762 | 2524 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | app | 616344 | 226141 | 76391 | 13448 | 204177 | 56503 | 22800 | 6984 | 9828 | 0 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | kernel | 734646 | 426693 | 55162 | 4046 | 108384 | 22 | 22 | 29643 | 103779 | 3742 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | app | 267812 | 121516 | 39410 | 344 | 54454 | 18837 | 2904 | 3492 | 26819 | 0 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | kernel | 413485 | 240114 | 32228 | 2694 | 64248 | 14 | 14 | 17675 | 51363 | 2118 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | app | 1405908 | 395882 | 94031 | 12 | 197051 | 18841 | 685712 | 5238 | 9087 | 0 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | kernel | 551269 | 321612 | 43368 | 3370 | 83240 | 18 | 18 | 23467 | 70161 | 2930 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | app | 163390 | 60419 | 24140 | 680 | 36517 | 18837 | 17384 | 3492 | 1885 | 0 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | kernel | 413485 | 240114 | 32228 | 2694 | 64248 | 14 | 14 | 17675 | 51363 | 2118 |
| ecdsar1+transfer_0_recursions+private_fpc | app | 399450 | 143249 | 51535 | 8072 | 134488 | 37670 | 12852 | 5238 | 6292 | 0 |
| ecdsar1+transfer_0_recursions+private_fpc | kernel | 582123 | 338235 | 43995 | 3370 | 88216 | 18 | 18 | 23827 | 78429 | 2930 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | app | 161835 | 52071 | 24385 | 1014 | 58825 | 18835 | 2902 | 2619 | 1157 | 0 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | kernel | 296848 | 173240 | 25370 | 2356 | 37438 | 12 | 12 | 13264 | 41964 | 1712 |
| ecdsar1+transfer_1_recursions+private_fpc | app | 463056 | 162918 | 56464 | 10762 | 168113 | 37672 | 12854 | 6111 | 8099 | 0 |
| ecdsar1+transfer_1_recursions+private_fpc | kernel | 665754 | 385944 | 49592 | 3708 | 98888 | 20 | 20 | 26747 | 94380 | 3336 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | app | 225441 | 71740 | 29314 | 3704 | 92450 | 18837 | 2904 | 3492 | 2964 | 0 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | kernel | 372470 | 218389 | 31450 | 2694 | 47638 | 14 | 14 | 16496 | 52143 | 2118 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | app | 199820 | 89310 | 24563 | 1152 | 52371 | 8 | 2082 | 3492 | 26806 | 0 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | kernel | 413485 | 240114 | 32228 | 2694 | 64248 | 14 | 14 | 17675 | 51363 | 2118 |

## Per-step breakdown per flow

### deploy_ecdsar1+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | MultiCallEntrypoint:entrypoint | 44141 | 5351 | 4165 | 2 | 33594 | 2 | 2 | 873 | 143 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | ContractInstanceRegistry:publish_for_public_execution | 6574 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | EcdsaRAccount:constructor | 34198 | 17680 | 1912 | 1678 | 807 | 2 | 10314 | 873 | 923 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 9 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 10 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 11 | kernel | private_kernel_tail | 29179 | 18731 | 3393 | 2 | 797 | 2 | 2 | 1415 | 4589 | 214 |
| 12 | kernel | hiding_kernel | 20994 | 11845 | 2558 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **643950** | **324953** | **64692** | **5054** | **127185** | **18855** | **13234** | **23421** | **62439** | **2524** |

### deploy_schnorr+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | MultiCallEntrypoint:entrypoint | 44141 | 5351 | 4165 | 2 | 33594 | 2 | 2 | 873 | 143 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | ContractInstanceRegistry:publish_for_public_execution | 6574 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | SchnorrAccount:constructor | 28629 | 14677 | 1834 | 1678 | 807 | 2 | 8138 | 873 | 611 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | SchnorrAccount:entrypoint | 50907 | 8260 | 4381 | 810 | 34106 | 2 | 2076 | 873 | 390 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 9 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 10 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 11 | kernel | private_kernel_tail | 29179 | 18731 | 3393 | 2 | 797 | 2 | 2 | 1415 | 4589 | 214 |
| 12 | kernel | hiding_kernel | 20994 | 11845 | 2558 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **570389** | **289744** | **49767** | **5862** | **125102** | **26** | **10236** | **23421** | **62114** | **2524** |

### ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | AMM:add_liquidity | 8276 | 4413 | 1579 | 338 | 163 | 2 | 2 | 873 | 897 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | Token:transfer_to_public_and_prepare_private_balance_increase | 158541 | 49067 | 9869 | 6382 | 81233 | 2 | 7050 | 873 | 4056 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | app | EcdsaRAccount:verify_private_authwit | 80011 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 104 | 0 |
| 9 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 10 | app | Token:transfer_to_public_and_prepare_private_balance_increase | 158541 | 49067 | 9869 | 6382 | 81233 | 2 | 7050 | 873 | 4056 | 0 |
| 11 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 12 | app | EcdsaRAccount:verify_private_authwit | 80011 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 104 | 0 |
| 13 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 14 | app | Token:prepare_private_balance_increase | 6559 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 15 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 16 | kernel | private_kernel_reset | 122404 | 65094 | 5594 | 1338 | 22506 | 2 | 2 | 3487 | 24141 | 206 |
| 17 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 18 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **1350990** | **652834** | **131553** | **17494** | **312561** | **56525** | **22822** | **36627** | **113607** | **3742** |

### ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | ContractClassRegistry:publish | 136833 | 74332 | 17305 | 2 | 18100 | 2 | 2 | 873 | 26208 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | ContractInstanceRegistry:publish_for_public_execution | 6574 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 9 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 10 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **681297** | **361630** | **71638** | **3038** | **118702** | **18851** | **2918** | **21167** | **78182** | **2118** |

### ecdsar1+storage_proof_7_layers+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | StorageProofTest:storage_proof | 89864 | 37518 | 12977 | 2 | 3372 | 2 | 28650 | 873 | 6461 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | StorageProofTest:verify_storage_proof_path_recursively | 397213 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 741 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | app | StorageProofTest:verify_storage_proof_path_recursively | 397213 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 741 | 0 |
| 9 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 10 | app | StorageProofTest:verify_storage_proof_path_recursively | 397213 | 104902 | 20134 | 2 | 52496 | 2 | 218054 | 873 | 741 | 0 |
| 11 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 12 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 13 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 14 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **1957177** | **717494** | **137399** | **3382** | **280291** | **18859** | **685730** | **28705** | **79248** | **2930** |

### ecdsar1+token_bridge_claim_private+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | TokenBridge:claim_private | 32393 | 13234 | 2031 | 338 | 163 | 2 | 14482 | 873 | 1261 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | Token:mint_to_private | 6592 | 3527 | 1457 | 338 | 163 | 2 | 2 | 873 | 221 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 9 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 10 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **576875** | **300533** | **56368** | **3374** | **100765** | **18851** | **17398** | **21167** | **53248** | **2118** |

### ecdsar1+transfer_0_recursions+private_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | FPC:fee_entrypoint_private | 8054 | 4289 | 1559 | 338 | 163 | 2 | 2 | 873 | 819 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | Token:transfer_to_public | 148497 | 48358 | 9077 | 6382 | 72742 | 2 | 7050 | 873 | 4004 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | EcdsaRAccount:verify_private_authwit | 80011 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 104 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | app | Token:prepare_private_balance_increase | 6559 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 9 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 10 | app | Token:transfer | 37430 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 754 | 0 |
| 11 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 12 | kernel | private_kernel_reset | 107665 | 58134 | 5567 | 1338 | 21330 | 2 | 2 | 3463 | 17589 | 206 |
| 13 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 14 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **981573** | **481484** | **95530** | **11442** | **222704** | **37688** | **12870** | **29065** | **84721** | **2930** |

### ecdsar1+transfer_0_recursions+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | Token:transfer | 37430 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 754 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 7 | kernel | private_kernel_tail | 29179 | 18731 | 3393 | 2 | 797 | 2 | 2 | 1415 | 4589 | 214 |
| 8 | kernel | hiding_kernel | 20994 | 11845 | 2558 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **458683** | **225311** | **49755** | **3370** | **96263** | **18847** | **2914** | **15883** | **43121** | **1712** |

### ecdsar1+transfer_1_recursions+private_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | FPC:fee_entrypoint_private | 8054 | 4289 | 1559 | 338 | 163 | 2 | 2 | 873 | 819 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | Token:transfer_to_public | 148497 | 48358 | 9077 | 6382 | 72742 | 2 | 7050 | 873 | 4004 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | EcdsaRAccount:verify_private_authwit | 80011 | 38213 | 16484 | 2 | 2597 | 18831 | 2898 | 873 | 104 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | app | Token:prepare_private_balance_increase | 6559 | 3510 | 1454 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 9 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 10 | app | Token:transfer | 37430 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 754 | 0 |
| 11 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 12 | app | Token:_recurse_subtract_balance | 63606 | 19669 | 4929 | 2690 | 33625 | 2 | 2 | 873 | 1807 | 0 |
| 13 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 14 | kernel | private_kernel_reset | 122404 | 65094 | 5594 | 1338 | 22506 | 2 | 2 | 3487 | 24141 | 206 |
| 15 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 16 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **1128810** | **548862** | **106056** | **14470** | **267001** | **37692** | **12874** | **32858** | **102479** | **3336** |

### ecdsar1+transfer_1_recursions+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | EcdsaRAccount:entrypoint | 118899 | 40466 | 19228 | 2 | 36189 | 18831 | 2898 | 873 | 403 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | Token:transfer | 37430 | 8413 | 3733 | 1010 | 22634 | 2 | 2 | 873 | 754 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | Token:_recurse_subtract_balance | 63606 | 19669 | 4929 | 2690 | 33625 | 2 | 2 | 873 | 1807 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | kernel | private_kernel_reset | 83541 | 45911 | 5450 | 1338 | 17058 | 2 | 2 | 3439 | 10101 | 206 |
| 9 | kernel | private_kernel_tail | 29179 | 18731 | 3393 | 2 | 797 | 2 | 2 | 1415 | 4589 | 214 |
| 10 | kernel | hiding_kernel | 20994 | 11845 | 2558 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **597911** | **290129** | **60764** | **6398** | **140088** | **18851** | **2918** | **19988** | **55107** | **2118** |

### schnorr+deploy_tokenContract_with_registration+sponsored_fpc

| # | side | circuit | total | arithmetic | delta_range | elliptic | memory | nnf | lookups | busread | p2_compressed | ecc_op |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | app | SchnorrAccount:entrypoint | 50907 | 8260 | 4381 | 810 | 34106 | 2 | 2076 | 873 | 390 | 0 |
| 1 | kernel | private_kernel_init | 32080 | 19655 | 3339 | 338 | 1293 | 2 | 2 | 2951 | 4264 | 202 |
| 2 | app | SponsoredFPC:sponsor_unconditionally | 5506 | 3192 | 1424 | 2 | 2 | 2 | 2 | 873 | 0 | 0 |
| 3 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 4 | app | ContractClassRegistry:publish | 136833 | 74332 | 17305 | 2 | 18100 | 2 | 2 | 873 | 26208 | 0 |
| 5 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 6 | app | ContractInstanceRegistry:publish_for_public_execution | 6574 | 3526 | 1453 | 338 | 163 | 2 | 2 | 873 | 208 | 0 |
| 7 | kernel | private_kernel_inner | 68892 | 40749 | 5570 | 338 | 9496 | 2 | 2 | 2896 | 9399 | 406 |
| 8 | kernel | private_kernel_reset | 76811 | 41511 | 4940 | 1338 | 16354 | 2 | 2 | 3103 | 9321 | 206 |
| 9 | kernel | private_kernel_tail | 73740 | 43223 | 4633 | 2 | 18111 | 2 | 2 | 2930 | 4589 | 214 |
| 10 | kernel | hiding_kernel | 24178 | 13478 | 2606 | 2 | 2 | 2 | 2 | 3 | 4992 | 278 |
|  | **total** |  | **613305** | **329424** | **56791** | **3846** | **116619** | **22** | **2096** | **21167** | **78169** | **2118** |
