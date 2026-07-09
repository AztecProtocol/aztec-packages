# ecc_gpu — CUDA MSM backend (spike)

GPU BN254 G1 MSM built on [sppark](https://github.com/supranational/sppark) (Apache-2.0),
with [blst](https://github.com/supranational/blst) providing sppark's host-side field
arithmetic. Both are pinned and fetched at build time by `cmake/sppark.cmake`. Enabled
only by the `gpu` CMake preset (`-DGPU=ON`); the stock `bb`/`bb-avm` builds and all
cross/release presets are unaffected.

## Layout

- `msm_gpu.hpp` / `msm_gpu.cu` — POD boundary and the single nvcc-compiled CUDA TU.
  No barretenberg headers cross into the CUDA TU and no std types cross the boundary,
  so the archive stays link-compatible with any host toolchain (including the zig-driven
  release link, which would consume `libecc_gpu.a` the same way it consumes the Rust
  `avm_transpiler` archive).
- `bb_msm_gpu.hpp` / `.cpp` — bb-typed wrapper: layout static_asserts, scalar staging
  (reduce to canonical Montgomery, never mutating caller buffers), resident-context
  cache keyed on the points span, and the strong definition of the facade hook.
- `scalar_multiplication.cpp` (in `ecc`) declares the hook weak: GPU dispatch activates
  only when a binary links `ecc_gpu` AND `BB_MSM_GPU` is set in the environment.
  Binaries that never reference `ecc_gpu` symbols directly won't extract the strong
  definition from the archive — link with WHOLE_ARCHIVE if that ever matters.

## Formats

- Points: staged into 72-byte `{x, y, inf=0}` records (sppark's `affine_inf_t` with an
  arkworks-style stride — the instantiation every upstream consumer uses), with each
  coordinate **canonicalized** from bb's coarse `[0, 2p)` Montgomery form to `[0, p)`
  (see the correctness section below; this is required, not optional).
- Scalars: converted to canonical standard form on the host
  (`from_montgomery_form_reduced`) and passed with `mont=false` — same per-scalar cost
  as the conversion the CPU MSM performs, and it side-steps sppark's device-side
  Montgomery path entirely. Caller buffers are never mutated.
- Results: sppark jacobian `(X, Y, Z)` maps directly onto bb's `element`; `Z == 0` is
  converted to bb's point-at-infinity encoding.

## Spike runbook (GPU=1 on a CI instance)

```bash
# 1. Launch a GPU instance (g6e.2xlarge: 8 vCPU + 1x L40S). GPU=1 makes the ci3 host
#    script install the NVIDIA driver + container toolkit at boot and start the devbox
#    with --gpus all. Takes a few minutes longer than a normal instance boot.
GPU=1 AWS_INSTANCE=g6e.2xlarge AWS_SHUTDOWN_TIME=480 ./ci.sh shell-new

# 2. Inside the devbox: install nvcc (idempotent; also runs automatically from
#    barretenberg/cpp/bootstrap.sh when GPU=1).
barretenberg/cpp/scripts/install_cuda_toolkit.sh

# 3. Build (barretenberg/cpp):
cmake --preset gpu && cmake --build --preset gpu

# 4. Correctness (GPU results compared against CPU pippenger):
./build-gpu/bin/ecc_gpu_tests

# 5. Benchmarks (CPU vs GPU one-shot vs GPU resident-SRS, 2^14..2^22 + AVM batch shape):
./build-gpu/bin/pippenger_gpu_bench --benchmark_min_time=2x
```

For a fair CPU baseline also capture `pippenger_bench` numbers from the dedicated
bench machine or an `m6a.metal` run — the g6e host CPU (8 vCPUs) badly understates the
production CPU Pippenger.

To exercise the facade dispatch in any gpu-preset binary that links `ecc_gpu`:
`BB_MSM_GPU=1 ./build-gpu/bin/<binary>`.

## Hybrid-link validation (production link shape)

The production integration links the nvcc-built archive into zig-linked binaries.
Validate on the GPU box:

```bash
cmake --build --preset gpu --target ecc_gpu
clang++ -std=c++20 -o /tmp/hybrid_check <small main calling gpu::msm_oneshot_bn254> \
  build-gpu/lib/libecc_gpu.a -L/usr/local/cuda/lib64 -lcudart_static \
  build-gpu/_deps/blst/src/blst_repo/libblst.a -lpthread -ldl -lrt -lstdc++
```

(Then repeat with `scripts/zig-c++.sh` as the linker driver.)

## Driver dependency (verified)

`cudart_static` loads `libcuda.so.1` lazily via dlopen — binaries linking `ecc_gpu` have
NO dynamic NEEDED entry on the driver and start fine on driver-less machines (verified:
`ecc_gpu_tests` skips all tests cleanly on a GPU-less box, `ldd` shows no cuda deps).
This means a single `bb` binary with the GPU backend statically linked + the
`BB_MSM_GPU` runtime flag is viable for productionisation; the remaining constraint is
only the toolchain split (nvcc TU vs zig release link), not runtime portability.

## Benchmark results (g6e.2xlarge: 1x L40S + 8 vCPU, 2026-07-09)

| n | CPU (8 vCPU) | GPU one-shot | GPU resident-SRS | GPU vs 8-vCPU CPU |
|------|---------:|--------:|--------:|-----:|
| 2^14 | 97.7 ms | 8.6 ms | 5.4 ms | 18x |
| 2^16 | 235 ms | 9.0 ms | 7.0 ms | 34x |
| 2^18 | 628 ms | 29.0 ms | 22.1 ms | 28x |
| 2^20 | 1969 ms | 113 ms | 58.9 ms | 33x |
| 2^22 | 5750 ms | 409 ms | 197 ms | 29x |
| 32 x 2^19 batch | — | — | 683 ms (21.3 ms/MSM) | — |

Context: a (loaded) 192-core m6a-class box does 2^20 in ~271 ms wall, so GPU-resident
(58.9 ms) is ~4.5x a full large CPU box at ~half the hourly cost — roughly 8-9x
perf/$ for large MSMs, before any tuning. Resident vs one-shot shows the fixed-SRS
pattern matters (~2x at large n: point upload dominates one-shot). The batch shape
amortizes further (21.3 ms vs 30.8 ms for an isolated 2^19).

## Correctness: root cause found and fixed (coarse coordinates)

The initial integration produced wrong MSM results whenever a point with a *coarse*
coordinate met a negative booth digit. Barretenberg keeps field elements lazily reduced
in [0, 2p) Montgomery form; sppark/blst require canonical [0, p) inputs (the signed
digit path computes p - y, which is wrong for coarse y). Every upstream sppark consumer
feeds it arkworks/blst values, which are always canonical, so only our integration hit
it. Fixed by canonicalizing coordinates in `stage_points` (msm_gpu.cu); scalars were
already reduced (`from_montgomery_form_reduced`) for the same reason.

Debugging history (for the curious): the failure pattern masqueraded as a GPU race for a
long day — it was input-dependent, and the test data was drawn from `get_randomness()`
(non-reproducible) for the first half of the investigation, which made identical builds
appear nondeterministic and different flags/architectures appear implicated. With a
deterministic seed every build on every GPU failed identically. The final diagnosis came
from stage-by-stage device-buffer dumps between a passing arkworks harness and a failing
C++ harness sharing identical archives and inputs: the first divergent bytes were a
point coordinate differing by exactly p. `quad_repro.cu` preserves a standalone
demonstration (it feeds raw sppark a coarse coordinate). compute-sanitizer racecheck
warnings in sppark's sort kernel appear to be benign warp-synchronous false positives;
initcheck is clean once buckets are zeroed (and the uninitialized reads it found were
benign in practice).

`ecc_gpu_tests` (15 tests incl. a 411-MSM sweep with culprit bisection, captured-input
regression, adversarial scalars and synthetic bucket collisions) passes 3/3 repeated
runs on A10G/sm_86; earlier failures on L40S/sm_89 had the same single root cause.

## Known limitations (spike scope)

- BN254 G1 only. Grumpkin needs an sppark instantiation over the swapped field pair
  (curve constant b = -17) — the fields themselves already exist in `ff/alt_bn128.hpp`.
- `batch_multi_scalar_mul` dispatches per-MSM through the resident context rather than
  as a true GPU batch; sppark's `msm_t` is serialised behind one mutex.
- GPU errors fall back to CPU silently in the facade path (`try_*` contract); the
  explicit `pippenger_bn254_oneshot` API throws instead.
- Boot-time driver install (ci3) should become a baked GPU AMI for anything durable.
