# App-proving bench: `si/poseidon2-opt-attempt + #22678` vs. `merge-train/barretenberg`

Single-run, remote EC2 bench machine (AMD EPYC 7R13, 8 physical cores, `HARDWARE_CONCURRENCY=16`), `bb prove --scheme chonk` over the 11 pinned CI app-proving flows.

**Branches**

| Column | Branch | Tip | Pinned IVC inputs | Notes |
|---|---|---|---|---|
| `si+22678` | `si/poseidon2-opt-attempt` with `lde/sumcheck-thread-strategy` merged in | `52082aca974` | `95b46ef9` | K=4 Poseidon2 compression + work-stealing sumcheck ([PR #22678](https://github.com/AztecProtocol/aztec-packages/pull/22678)) |
| `mt` | `merge-train/barretenberg` | `a97228435` | `286d8dd0` | stock baseline |

- Native preset: `clang20-no-avm` (`AVM=0 AVM_TRANSPILER=0 ./bootstrap.sh build_native`).
- WASM preset: `wasm-threads`, executed via `wasmtime` on the remote machine.
- Peak memory: `ci3/memusage` (polls RSS every 100 ms).
- Δ columns are `(si+22678 − mt) / mt`; negative = faster / lower than merge-train.

## Native

| Flow | mt | si+22678 | Δ time | mt mem | si+22678 mem | Δ mem |
|---|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    |  7.43s |  6.75s |  **−9.2%** | 307 MB | 299 MB |  −2.6% |
| deploy_schnorr+sponsored_fpc                                    |  7.25s |  6.34s | **−12.6%** | 309 MB | 301 MB |  −2.6% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 12.43s | 10.97s | **−11.7%** | 491 MB | 447 MB |  **−9.0%** |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    |  7.95s |  6.96s | **−12.4%** | 457 MB | 408 MB | **−10.7%** |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 16.40s | 15.37s |  **−6.3%** | 850 MB | 896 MB |  +5.4% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                |  6.75s |  6.25s |  **−7.3%** | 311 MB | 302 MB |  −2.9% |
| ecdsar1+transfer_0_recursions+private_fpc                       |  9.76s |  8.72s | **−10.7%** | 426 MB | 389 MB |  **−8.7%** |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     |  5.82s |  5.37s |  **−7.7%** | 290 MB | 285 MB |  −1.7% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 11.01s |  9.70s | **−11.8%** | 488 MB | 417 MB | **−14.5%** |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     |  6.84s |  6.20s |  **−9.4%** | 305 MB | 297 MB |  −2.6% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    |  7.83s |  6.61s | **−15.6%** | 455 MB | 372 MB | **−18.2%** |
| **total / peak**                                                | **99.47s** | **89.23s** | **−10.3%** | **850 MB** | **896 MB** | **+5.4%** |

## WASM

| Flow | mt | si+22678 | Δ time | mt mem | si+22678 mem | Δ mem |
|---|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    | 25.81s | 23.91s |  **−7.4%** | 1090 MB† | 1098 MB† |  +0.7% |
| deploy_schnorr+sponsored_fpc                                    | 20.14s | 18.06s | **−10.3%** |  319 MB |  308 MB |  −3.4% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 35.41s | 31.53s | **−11.0%** |  510 MB |  440 MB | **−13.7%** |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    | 22.63s | 19.68s | **−13.0%** |  490 MB |  413 MB | **−15.7%** |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 51.07s | 48.67s |  **−4.7%** |  852 MB |  875 MB |  +2.7% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                | 19.32s | 17.79s |  **−7.9%** |  321 MB |  310 MB |  −3.4% |
| ecdsar1+transfer_0_recursions+private_fpc                       | 27.87s | 24.97s | **−10.4%** |  439 MB |  405 MB |  **−7.7%** |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     | 16.56s | 15.29s |  **−7.7%** |  303 MB |  295 MB |  −2.6% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 31.48s | 27.82s | **−11.7%** |  490 MB |  418 MB | **−14.7%** |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     | 19.39s | 17.76s |  **−8.4%** |  315 MB |  308 MB |  −2.2% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    | 21.58s | 18.93s | **−12.3%** |  488 MB |  413 MB | **−15.4%** |
| **total / peak**                                                | **291.27s** | **264.42s** | **−9.2%** | **1090 MB†** | **1098 MB†** |  **+0.7%** |

† `deploy_ecdsar1+sponsored_fpc/wasm` peaks at ~1 GB on both branches while its native counterpart sits at ~300 MB. Every other flow's WASM peak tracks native within ~5%. The ~1 GB figure is a wasmtime linear-memory accounting artifact, not a genuine working-set difference.

## Summary

- **Time**: the combined K=4 Poseidon2 compression + work-stealing sumcheck beats the baseline on every flow, both runtimes.
  - Native total: **−10.3%** (99.47s → 89.23s).
  - WASM total:  **−9.2%** (291.27s → 264.42s).
  - Biggest wins are on `schnorr+deploy_tokenContract_with_registration` (−15.6% native / −12.3% WASM) and on the `transfer_1_recursions+private_fpc` / `amm` / `deploy_tokenContract` class of mid-sized flows (≈−11 to −13%). `storage_proof_7_layers` is the smallest relative win but still saves ~1 s native / ~2.4 s WASM.
- **Native memory**: roughly −3% on small flows, **−8% to −18%** on mid-to-large flows. `storage_proof_7_layers` is the only regression (+5.4%) and it drives the totals' peak figure.
- **WASM memory**: −3% on small flows, **−13% to −16%** on the bigger flows. Total peak is nearly unchanged because of the wasmtime artifact flow (`deploy_ecdsar1+sponsored_fpc/wasm`).
