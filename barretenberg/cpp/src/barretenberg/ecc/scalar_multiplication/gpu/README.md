# Batched GPU MSM

An opt-in CUDA backend for the batched multi-scalar multiplications behind `CommitmentKey`. The AVM prover selects a backend once, at construction (`make_msm_backend<Curve>()` in `commitment_schemes/msm_backend_factory.hpp`); there is no run-time switch and no silent CPU fallback. With `-DGPU_MSM=ON` the AVM prover computes its commitments on the GPU. With the option off (the default) nothing here is compiled into `bb` except the CPU backend and the backend wrapper, which the tests drive with a CPU reference runner.

## Layout

| File | Role |
|---|---|
| `msm_core.hpp` | Plain-data interface (`U256`, `AffinePoint`, `CoreConfig`, `msm_batch_cuda`). |
| `msm_kernels_impl.hpp` | The kernel arithmetic, included by `msm_cuda.cu` and compiled only as device code. `mac64`, `raw_add` and `raw_sub` use PTX carry-chain instructions. `-DGPU_MSM_NO_PTX` selects portable C++ for comparison. |
| `msm_cuda.cu` | The device implementation, compiled with `nvcc`. |
| `../../commitment_schemes/msm_backend.hpp` | `MsmBackend<Curve>` interface injected into `CommitmentKey`, and the `FixedBases` handle (SRS prepared once per backend). |
| `../../commitment_schemes/gpu_msm_adapter.*` | Conversion between barretenberg field/group types and the plain-data types. Point coordinates are barretenberg's stored Montgomery limbs, copied without arithmetic; scalars are converted to canonical integers. |
| `../../commitment_schemes/gpu_msm_backend.*` | `MsmBackend` that converts types and calls an injected batch runner (`msm_batch_cuda` in the factory). Tests inject a CPU reference runner so the whole path is checked without a GPU. |

## How a call runs

`msm_batch_cuda` splits a batch into column groups. For each group the host drops zero scalars (parallel count, then fill) while the device works on the previous group. On the device:

1. Identical wide scalars within a column are merged: their points are summed once and the extra items are zeroed (`CoreConfig::dedup_scalars`, runs shorter than `kMinDuplicateRun` = 4 are left alone).
2. Windows run in groups sized by a memory budget (`CoreConfig::window_group`, `window_memory_bytes`). Each `(window, column)` pair is a virtual column, so all of a group's windows go through every step together.
3. Per window group: signed-digit bucket keys, radix sort (CUB), bucket ranges, accumulation (light slots one thread each, slots over 256 items by chunk and combine kernels), segmented reduce, combine, then per-column window combine and conversion to affine.

The automatic `window_bits` is capped at 13 (`kMaxAutoWindowBits`). Explicit values up to 16 still work.

## Results

Mega-bulk AVM proof, one RTX 4090 with a 13.6 CPU quota behind 128 visible cores (heavily throttled, so absolute times are noisy). Four alternating CPU/GPU rounds, medians in ms. All 8 proofs have the same hash.

| | CPU | GPU |
|---|---|---|
| `proving/all` | 26454 | 21621 |
| wire commitments | 4349 | 2996 |
| log-derivative commitments | 5090 | 994 |
| PCS rounds | 2022 | 1491 |

- Sumcheck (about 12-14 s, over half of the CPU proof) runs on the CPU in every build. Only commitments are on the GPU.
- PTX carry chains in the field arithmetic (measured after the table above, same machine, 5 alternating rounds): `proving/all` 19936 ms to 18524 ms, wire commitments 2993 ms to 2608 ms, log-derivative 950 ms to 687 ms, PCS rounds 1488 ms to 1212 ms. GPU-only on the recorded columns: wires about 16% faster, log-derivative about 28%, one 398k column about 20%.
- Passing barretenberg's Montgomery limbs to the core as they are, instead of converting each coordinate to a canonical integer and back, was within noise end to end (20316 ms vs 20137 ms); it is kept because it removes host-side arithmetic and code.
- The commitment rounds were about 36% of the CPU proof and got 2.3x faster, so Amdahl predicts about 1.25x; measured is 1.22x.
- With the commitment rounds at zero the proof would take about 15 s, so further MSM tuning is capped at a few seconds. Sumcheck is the next large lever.
- The CPU Pippenger dedup pre-pass is off for the AVM (`vm2/constraining/prover.cpp` passes no `has_duplicates_hint`). A local experiment hinting only the wire columns made the CPU wire round about 24% faster; the GPU merge below does the equivalent unconditionally.

Measured effect of each change:

- Concurrent windows: one 398k-scalar column 483 ms to 67 ms; the 22 single-column PCS commits 4040 ms to 512 ms. The cause was serial per-window chains in reduce and combine.
- Host/device pipeline: wire-shaped batch about 3.9 s to 3.4 s. Each extra group costs about 20 ms, so small batches stay at one group.
- `window_bits` cap of 13: 14 real columns 185 ms to 140 ms; wire-shaped batch about 3.4 s to 2.8 s.
- Repeated-scalar merge: on the recorded wire call 67.7% of the wide scalars sit in runs of 8 or more (5.47M of 8.16M removable). GPU-only, wires 3035 ms to 2285 ms and log-derivative 1297 ms to 1003 ms.

## Tests

- `commitment_schemes/commitment_key_msm_backend.test.cpp` (part of `commitment_schemes_tests`) checks that the injected backends, including the GPU backend with a CPU reference runner, produce the same commitments as the CPU backend.
- `gpu_msm_tests/test_cuda.cpp` (needs a GPU) runs the device implementation against the vectors in `gpu_msm_tests/vectors/` across window groups, pipeline groups, repeated scalars with the merge on and off, batch vs single columns, and an empty batch. The kernels have no CPU build, so they are covered only where a GPU is available. It is a standalone program:

```
nvcc -O3 -std=c++20 -arch=sm_89 -I barretenberg/cpp/src \
    barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/gpu/msm_cuda.cu barretenberg/cpp/gpu_msm_tests/test_cuda.cpp -o test_cuda
./test_cuda barretenberg/cpp/gpu_msm_tests/vectors/*.txt
```

  `gpu_msm_tests/gen_vectors.py <bn254|grumpkin> <dir>` regenerates the vectors and writes larger ones (`mid`, `avm_shaped`) that are not checked in.
- `gpu_msm_tests/bench_cuda.cpp` is the standalone benchmark: `bench_cuda <pool.txt> <log2_rows> <columns> [window_bits] [repeats]`, or `--dump-dir <dir>` for recorded columns, with `--window-group N`, `--window-memory-mb M`, `--pipeline N`, `--no-dedup`, `--grumpkin`, `--check`. Use at least 7 repeats; the first call pays about 300 ms of CUDA initialisation.

## End to end

Build `bb-avm` twice from one tree, once with `-DGPU_MSM=ON -DGPU_MSM_CUDA_ARCH=sm_89` and once with `-DGPU_MSM=OFF`, then alternate `avm_prove --avm-inputs <inputs>` with `AVM_STATS_DEPTH=2` and compare `proving/all_ms`, the stage timers and the proof hash. Compare within a round, not across sessions.

## Known limits and next steps

- The Jacobian add used for bucket accumulation converts each affine point to Jacobian form (3 extra field multiplications per item). A true mixed addition would remove that.
- Kernels use 172-255 registers per thread (8 resident warps per SM), so most are latency-bound. PTX carry chains are in place; a lower register budget is untried.
- `window_bits` 11-12 looked better than 13 on some shapes but was noisy. Untuned.
- `msm_batch_cuda` copies points per work item on every call. The conversion to the core's point type happens once, in `prepare_bases`, but the points are not resident on the device between calls.
- The merge's cost on a call with no repeated values was not measured directly. The 22 single-column PCS commits showed no regression.
