# Chonk Remote Benchmarks

## Summary

| # | Flow | Circuits | Total (s) | Accumulate (s) | Prove (s) | Load (ms) | Peak mem (MiB) |
|---|---|---|---|---|---|---|---|
| 1 | deploy_ecdsar1+sponsored_fpc | 13 | 7.68 | 5.14 | 2.36 | 158 | 310.87 |
| 2 | deploy_schnorr+sponsored_fpc | 13 | 7.37 | 4.81 | 2.37 | 160 | 311.40 |
| 3 | ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 19 | 12.61 | 9.59 | 2.62 | 342 | 523.71 |
| 4 | ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 11 | 8.16 | 5.66 | 2.27 | 194 | 459.11 |
| 5 | ecdsar1+token_bridge_claim_private+sponsored_fpc | 11 | 7.06 | 4.60 | 2.27 | 158 | 313.44 |
| 6 | ecdsar1+transfer_0_recursions+private_fpc | 15 | 9.96 | 7.23 | 2.44 | 259 | 433.19 |
| 7 | ecdsar1+transfer_0_recursions+sponsored_fpc | 9 | 6.11 | 3.79 | 2.17 | 114 | 294.02 |
| 8 | ecdsar1+transfer_1_recursions+private_fpc | 17 | 11.26 | 8.36 | 2.55 | 301 | 509.51 |
| 9 | ecdsar1+transfer_1_recursions+sponsored_fpc | 11 | 7.11 | 4.67 | 2.26 | 156 | 308.41 |
| 10 | schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 11 | 7.87 | 5.36 | 2.28 | 196 | 462.34 |

## Baseline

| # | Flow | Circuits | Total (s) | Accumulate (s) | Prove (s) | Load (ms) | Peak mem (MiB) |
|---|---|---|---|---|---|---|---|
| 1 | deploy_ecdsar1+sponsored_fpc | 13 | 7.63 | 4.99 | 2.46 | 155 | 311.31 |
| 2 | deploy_schnorr+sponsored_fpc | 13 | 7.31 | 4.66 | 2.47 | 156 | 312.44 |
| 3 | ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 19 | 12.82 | 9.76 | 2.67 | 343 | 513.35 |
| 4 | ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 11 | 8.07 | 5.57 | 2.28 | 192 | 458.79 |
| 5 | ecdsar1+token_bridge_claim_private+sponsored_fpc | 11 | 6.97 | 4.41 | 2.38 | 160 | 316.43 |
| 6 | ecdsar1+transfer_0_recursions+private_fpc | 15 | 10.03 | 7.27 | 2.47 | 258 | 427.96 |
| 7 | ecdsar1+transfer_0_recursions+sponsored_fpc | 9 | 5.92 | 3.52 | 2.26 | 112 | 294.53 |
| 8 | ecdsar1+transfer_1_recursions+private_fpc | 17 | 11.32 | 8.42 | 2.57 | 301 | 500.86 |
| 9 | ecdsar1+transfer_1_recursions+sponsored_fpc | 11 | 7.02 | 4.49 | 2.36 | 153 | 309.69 |
| 10 | schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 11 | 7.81 | 5.30 | 2.28 | 195 | 458.34 |

## Branch vs Baseline (Total time)

| # | Flow | Branch Total (s) | Baseline Total (s) | Δ (s) | Δ (%) |
|---|---|---|---|---|---|
| 1 | deploy_ecdsar1+sponsored_fpc | 7.68 | 7.63 | +0.05 | +0.66% |
| 2 | deploy_schnorr+sponsored_fpc | 7.37 | 7.31 | +0.06 | +0.82% |
| 3 | ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 12.61 | 12.82 | −0.21 | −1.64% |
| 4 | ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 8.16 | 8.07 | +0.09 | +1.12% |
| 5 | ecdsar1+token_bridge_claim_private+sponsored_fpc | 7.06 | 6.97 | +0.09 | +1.29% |
| 6 | ecdsar1+transfer_0_recursions+private_fpc | 9.96 | 10.03 | −0.07 | −0.70% |
| 7 | ecdsar1+transfer_0_recursions+sponsored_fpc | 6.11 | 5.92 | +0.19 | +3.21% |
| 8 | ecdsar1+transfer_1_recursions+private_fpc | 11.26 | 11.32 | −0.06 | −0.53% |
| 9 | ecdsar1+transfer_1_recursions+sponsored_fpc | 7.11 | 7.02 | +0.09 | +1.28% |
| 10 | schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 7.87 | 7.81 | +0.06 | +0.77% |

Mean Δ: +0.029 s (+0.63%). Within the ±5% noise caveat.
