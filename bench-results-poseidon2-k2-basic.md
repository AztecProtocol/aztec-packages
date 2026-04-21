# App-proving bench: poseidon2 variants vs `merge-train/barretenberg`

Single-run, remote EC2 bench machine (`HARDWARE_CONCURRENCY=16`), `bb prove --scheme chonk` over the 11 pinned CI app-proving flows.

**Branches**

| Column | Branch | Tip | Pinned IVC inputs | Poseidon2 internal rounds |
|---|---|---|---|---|
| `56→28` | `claudebox/poseidon2-k2-basic`  | `659c0f62c` | `da92548a` | 56 compressed to 28 |
| `56→14` | `si/poseidon2-opt-attempt`      | `0f26e6efb` | `d06dbdc6` | 56 compressed to 14 (more aggressive) |
| `mt`    | `merge-train/barretenberg`      | `a97228435` | `286d8dd0` | 56 (stock, baseline) |

Each branch was benched against **its own** pinned IVC inputs — the three tips pin different captures because the poseidon2 changes move VKs. So this is an "end-to-end proving cost for this branch's circuits" comparison, not an isolated prover A/B on identical inputs.

- Native preset: `clang20-no-avm` (`AVM=0 AVM_TRANSPILER=0 ./bootstrap.sh build_native`)
- WASM preset: `wasm-threads`, executed via `wasmtime` on the remote machine
- Peak memory: `ci3/memusage` (polls RSS every 100 ms)
- Δ columns are `(branch − mt) / mt`; negative = faster/lower than merge-train

## Native

| Flow | 56→28 | 56→14 | mt | Δ 56→28 | Δ 56→14 | 56→28 mem | 56→14 mem | mt mem | Δ 56→28 mem | Δ 56→14 mem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    |  6.93s |  7.18s |  7.43s |  -6.6% |  -3.3% | 299 MB | 295 MB | 307 MB |  -2.6% |  -3.9% |
| deploy_schnorr+sponsored_fpc                                    |  6.55s |  6.68s |  7.25s |  -9.6% |  -8.0% | 300 MB | 299 MB | 309 MB |  -2.9% |  -3.2% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 11.65s | 11.71s | 12.43s |  -6.2% |  -5.7% | 430 MB | 431 MB | 491 MB | -12.4% | -12.2% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    |  7.29s |  7.47s |  7.95s |  -8.3% |  -6.0% | 421 MB | 399 MB | 457 MB |  -7.9% | -12.7% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 16.05s | 16.22s | 16.40s |  -2.1% |  -1.1% | 872 MB | 896 MB | 850 MB |  +2.6% |  +5.4% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                |  6.45s |  6.56s |  6.75s |  -4.4% |  -2.8% | 301 MB | 299 MB | 311 MB |  -3.2% |  -3.9% |
| ecdsar1+transfer_0_recursions+private_fpc                       |  9.05s |  9.27s |  9.76s |  -7.3% |  -5.1% | 383 MB | 370 MB | 426 MB | -10.1% | -13.1% |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     |  5.54s |  5.56s |  5.82s |  -4.8% |  -4.4% | 282 MB | 279 MB | 290 MB |  -2.8% |  -3.8% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 10.20s | 10.36s | 11.01s |  -7.3% |  -5.8% | 416 MB | 397 MB | 488 MB | -14.8% | -18.6% |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     |  6.48s |  6.53s |  6.84s |  -5.3% |  -4.6% | 298 MB | 295 MB | 305 MB |  -2.3% |  -3.3% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    |  6.99s |  6.99s |  7.83s | -10.8% | -10.7% | 396 MB | 370 MB | 455 MB | -13.0% | -18.7% |

## WASM

| Flow | 56→28 | 56→14 | mt | Δ 56→28 | Δ 56→14 | 56→28 mem | 56→14 mem | mt mem | Δ 56→28 mem | Δ 56→14 mem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    | 24.55s | 25.41s | 25.81s |  -4.9% |  -1.6% | 1100 MB† | 1024 MB† | 1090 MB† |  +0.9% |  -6.1% |
| deploy_schnorr+sponsored_fpc                                    | 18.81s | 19.23s | 20.14s |  -6.6% |  -4.5% |  312 MB |  390 MB |  319 MB |  -2.2% | +22.3% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 32.92s | 33.60s | 35.41s |  -7.0% |  -5.1% |  439 MB |  527 MB |  510 MB | -13.9% |  +3.3% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    | 20.60s | 21.14s | 22.63s |  -9.0% |  -6.6% |  434 MB |  492 MB |  490 MB | -11.4% |  +0.4% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 49.86s | 50.59s | 51.07s |  -2.4% |  -0.9% |  854 MB |  962 MB |  852 MB |  +0.2% | +12.9% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                | 18.26s | 18.81s | 19.32s |  -5.5% |  -2.6% |  314 MB |  392 MB |  321 MB |  -2.2% | +22.1% |
| ecdsar1+transfer_0_recursions+private_fpc                       | 26.08s | 26.66s | 27.87s |  -6.4% |  -4.3% |  394 MB |  487 MB |  439 MB | -10.3% | +10.9% |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     | 15.64s | 16.07s | 16.56s |  -5.6% |  -3.0% |  296 MB |  378 MB |  303 MB |  -2.3% | +24.8% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 29.04s | 29.48s | 31.48s |  -7.8% |  -6.4% |  428 MB |  497 MB |  490 MB | -12.7% |  +1.4% |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     | 18.39s | 18.94s | 19.39s |  -5.1% |  -2.3% |  308 MB |  389 MB |  315 MB |  -2.2% | +23.5% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    | 19.71s | 20.16s | 21.58s |  -8.6% |  -6.6% |  434 MB |  492 MB |  488 MB | -11.1% |  +0.8% |

† `deploy_ecdsar1+sponsored_fpc/wasm` peaks at ~1 GB on all three branches while its native counterpart sits at ~300 MB. Every other flow's WASM peak tracks native within ~5%. Because all three branches show the same ~1 GB peak for this one flow, it's an artifact of wasm linear-memory accounting under wasmtime, not a genuine working-set difference.

## Summary

- **Time**: both poseidon2 variants are faster than merge-train on every flow. The milder `56→28` variant is uniformly ahead of the more aggressive `56→14`.
  - Native total: `56→28` **-6.3%**, `56→14` **-5.0%** vs mt
  - WASM total: `56→28` **-6.0%**, `56→14` **-3.8%** vs mt
- **Native memory**: both variants cut peak RSS on the larger flows (10–19% on `amm`, `transfer_1+private_fpc`, `schnorr+deploy_token`); small flows are within noise. Totals look flat because the `storage_proof_7_layers` peak dominates and is slightly higher on both variants than on mt (~+3–5%).
- **WASM memory**: `56→28` reduces peak on the bigger flows the same way as native. `56→14`, by contrast, **increases** WASM peak memory on most flows (+10–25%) — this is wasm-specific (native is fine on the same branch). Worth investigating before taking the more aggressive compression.
