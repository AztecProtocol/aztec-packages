# K=2 Poseidon2 Compressed-Internal Bench (native Chonk)

Baseline prover timings at the **K=2** compressed-internal state (46 gates/permutation),
before the K=4 "more aggressive compression" commit (32 gates/permutation).

Companion to [`poseidon2_double_internal_round.md`](./poseidon2_double_internal_round.md).

## Setup

| | |
|---|---|
| Commit | `8e36689d5dc` ("upd"), branch `si/poseidon2-opt-attempt` |
| Poseidon2 encoding | K=2 (double-internal), 46 gates/permutation |
| bb binary | `barretenberg/cpp/build/bin/bb` (clang20 preset, AVM on, release) |
| Pinned inputs | S3 hash `fe2d7311` (matches K=2 VKs) — `scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs` |
| Inputs path | `yarn-project/end-to-end/example-app-ivc-inputs-out/<flow>/ivc-inputs.msgpack` |
| Iterations per flow | 3 |
| `HARDWARE_CONCURRENCY` | 8 |
| Invocation | `bb prove --scheme chonk -o <out> --ivc_inputs_path <msgpack> --bench_out_hierarchical … --memory_profile_out …` |
| Wall-clock source | `date +%s%N` deltas around the `bb prove` call |

## Results

Wall-clock prove time per flow, in seconds (3 iterations each).

| flow | n | min_s | median_s | mean_s | max_s | stddev_ms |
|---|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 3 | 7.359 | 7.497 | 7.504 | 7.655 | 148.1 |
| deploy_schnorr+sponsored_fpc | 3 | 7.207 | 7.416 | 7.387 | 7.539 | 167.8 |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 3 | 13.573 | 13.639 | 13.722 | 13.955 | 204.2 |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 3 | 8.177 | 8.250 | 8.269 | 8.381 | 103.4 |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 3 | 17.676 | 17.937 | 17.943 | 18.216 | 270.0 |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 3 | 6.976 | 7.370 | 7.259 | 7.432 | 247.3 |
| ecdsar1+transfer_0_recursions+private_fpc | 3 | 9.997 | 10.477 | 10.492 | 11.001 | 502.2 |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 3 | 6.066 | 6.176 | 6.228 | 6.442 | 193.3 |
| ecdsar1+transfer_1_recursions+private_fpc | 3 | 11.656 | 12.105 | 12.002 | 12.244 | 307.3 |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 3 | 6.922 | 6.993 | 6.984 | 7.038 | 58.5 |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 3 | 7.575 | 7.653 | 7.704 | 7.883 | 160.1 |
| **TOTAL (sum of medians)** | — | — | **105.513** | **105.494** | — | — |

Heaviest flow: `ecdsar1+storage_proof_7_layers+sponsored_fpc` (~17.9 s median).
Lightest: `ecdsar1+transfer_0_recursions+sponsored_fpc` (~6.2 s median).
All std-devs ≤ 0.5 s; most ≤ 0.3 s — noise is small enough for A/B comparison against K=4.

## WASM (single iteration)

Same flows, WASM build (`wasm-threads` preset), 1 iteration each via
`scripts/wasmtime.sh`, `HARDWARE_CONCURRENCY=8`.

| flow | native_s (median) | wasm_s | wasm/native |
|---|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc | 7.497 | 20.985 | 2.80× |
| deploy_schnorr+sponsored_fpc | 7.416 | 19.837 | 2.67× |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc | 13.639 | 34.731 | 2.55× |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc | 8.250 | 22.213 | 2.69× |
| ecdsar1+storage_proof_7_layers+sponsored_fpc | 17.937 | 53.450 | 2.98× |
| ecdsar1+token_bridge_claim_private+sponsored_fpc | 7.370 | 18.536 | 2.52× |
| ecdsar1+transfer_0_recursions+private_fpc | 10.477 | 28.467 | 2.72× |
| ecdsar1+transfer_0_recursions+sponsored_fpc | 6.176 | 16.337 | 2.65× |
| ecdsar1+transfer_1_recursions+private_fpc | 12.105 | 32.018 | 2.65× |
| ecdsar1+transfer_1_recursions+sponsored_fpc | 6.993 | 19.240 | 2.75× |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc | 7.653 | 20.655 | 2.70× |
| **TOTAL** | **105.513** | **286.469** | **2.72×** |

Overall WASM slowdown 2.72× (in line with the ~2.8× typical for this stack).
The heaviest Poseidon2-bound flow (`storage_proof_7_layers`) has the worst ratio
(2.98×), consistent with WASM paying more for pow5-heavy workloads.

## Reproducing

From the repo root:

```bash
# Check out the K=2 state in an isolated worktree
git worktree add /tmp/aztec-k2 8e36689

# Build bb native (uses remote cache if available)
cd /tmp/aztec-k2/barretenberg/cpp && ./bootstrap.sh build_native

# Build WASM bb (uses remote cache if available)
cd /tmp/aztec-k2/barretenberg/cpp && \
  bash -c 'source ./bootstrap.sh && build_preset wasm-threads'

# Download pinned inputs matching the K=2 VKs (fe2d7311)
cd scripts && ./test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs

# Native: 3 iter × 11 flows, ~5–6 min (HARDWARE_CONCURRENCY=8)
# WASM:   1 iter × 11 flows, ~5 min   (HARDWARE_CONCURRENCY=8, via wasmtime.sh)
```

Driver (`bench.sh`):

```bash
#!/usr/bin/env bash
set -eu
BB=/tmp/aztec-k2/barretenberg/cpp/build/bin/bb
INPUTS=/tmp/aztec-k2/yarn-project/end-to-end/example-app-ivc-inputs-out
OUT=/tmp/aztec-k2-bench
mkdir -p "$OUT" && echo "flow,iter,elapsed_ms" > "$OUT/results.csv"
for flow in "$INPUTS"/*/; do
  f=$(basename "$flow")
  for iter in 1 2 3; do
    o=$OUT/$f/iter$iter; rm -rf "$o"; mkdir -p "$o"
    start=$(date +%s%N)
    HARDWARE_CONCURRENCY=8 "$BB" prove -o "$o" \
      --ivc_inputs_path "$flow/ivc-inputs.msgpack" --scheme chonk \
      --bench_out_hierarchical "$o/benchmark_breakdown.json" \
      --memory_profile_out "$o/memory_profile.json" >"$o/bb.log" 2>&1
    elapsed=$(( ( $(date +%s%N) - start ) / 1000000 ))
    echo "$f,$iter,$elapsed" >> "$OUT/results.csv"
    echo "$f iter=$iter elapsed_ms=$elapsed"
  done
done
```

## Next step

Repeat the same 3-iteration matrix against the current K=4 tip (HEAD / `f3eb2be54`)
in a second worktree (`/tmp/aztec-k4`) and diff the per-flow medians. The K=4
hypothesis — pow5 budget per permutation went UP (~85 → ~98) while row count
halved — predicts small-to-no wins on most flows and possible regressions on the
Poseidon2-heavy ones (`storage_proof_7_layers`, `amm_add_liquidity`).
