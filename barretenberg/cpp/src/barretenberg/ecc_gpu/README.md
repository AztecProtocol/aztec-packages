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

- Points: plain affine `(x, y)`, 64 bytes, Montgomery-form coordinates — bb's SRS layout
  is bit-identical to sppark's `Affine_t`, so points upload with no conversion.
  (Do NOT use sppark's `affine_inf_t`: its extra `inf` flag changes the host stride.)
- Scalars: Montgomery form (`mont=true`), staged through a reduced copy because bb
  permits coarse `[0, 2r)` encodings and sppark requires canonical.
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

## Known limitations (spike scope)

- BN254 G1 only. Grumpkin needs an sppark instantiation over the swapped field pair
  (curve constant b = -17) — the fields themselves already exist in `ff/alt_bn128.hpp`.
- `batch_multi_scalar_mul` dispatches per-MSM through the resident context rather than
  as a true GPU batch; sppark's `msm_t` is serialised behind one mutex.
- GPU errors fall back to CPU silently in the facade path (`try_*` contract); the
  explicit `pippenger_bn254_oneshot` API throws instead.
- Boot-time driver install (ci3) should become a baked GPU AMI for anything durable.
