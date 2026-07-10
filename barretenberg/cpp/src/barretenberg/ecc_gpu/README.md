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

## Real-workload results (g6e.4xlarge: L40S + 16 vCPU, 2026-07-10)

Full `bb`/`bb-avm` binaries with the GPU backend (`GPU=ON` links ecc_gpu whole-archive;
runtime toggle `BB_MSM_GPU=1`, size threshold `BB_MSM_GPU_MIN_SIZE`, default 2^16):

| Workload | CPU | GPU | Notes |
|---|---:|---:|---|
| AVM bulk proof (standalone avm_prove) | 14.5 s | 28.5 s (thr 2^16) / 14.6 s (thr 2^18+) | All columns in this trace < 2^18; sequential per-MSM round trips lose to the 16-core CPU batch driver |
| e2e_prover/full (4 tests, real proofs) | 435.4 s | 424.1 s | Both pass — end-to-end correctness with GPU MSM in the live prover stack; e2e wall dominated by non-proving work |

Conclusion: the isolated MSM speedups (previous section) do not transfer to current
prover workloads through per-MSM dispatch. The binding constraint is serialization —
one mutex-guarded sppark `msm_t` at a time, per-MSM staging/transfer/reduction — while
the CPU batch driver amortises thousands of (mostly small) commitments across all
cores. Realising the GPU win requires **multi-MSM pipelining**: a pool of `msm_t`
instances over CUDA streams with overlapped scalar staging/upload, host reductions off
the critical path, and batched submission from `batch_multi_scalar_mul`. Until then the
GPU path is correct (proofs byte-compatible, all suites green on sm_86 and sm_89) but
not faster for AVM/rollup-shaped batches.

## Tx-to-root replay benchmark (2026-07-10)

`scripts/replay_prover_bench.sh` replays a captured set of real proving jobs — the full
chain for a proven epoch (AVM → chonk verifier → base/parity → block-root →
checkpoint-root → root rollup) — through pure bb, with per-stage timing and MSM share
(`BB_MSM_STATS=1`). Fixtures are minted by running any real-proof test with
`BB_DEBUG_OUTPUT_DIR` set (e.g. `e2e_prover/full`: 1 private + 1 public transfer with
fees = 11 proving jobs). This is the benchmark for "does GPU MSM help real prover
workloads", answering what the isolated MSM benches above cannot.

Sequential single chain on g6e.4xlarge (16 vCPU + L40S), same binary
(`build-gpu/bin/bb-avm`), GPU toggled via env:

| Config | Chain total | vs CPU | Notes |
|---|---:|---:|---|
| CPU | 200.1 s | — | MSM share 38.4% of job wall |
| GPU, threshold 2^16 (default) | 196.2 s | -2% | Stage wins and losses cancel |
| GPU, threshold 2^19 | 196.2 s | -2% | PublicTxBase still regresses |
| GPU, threshold 2^20 | **185.2 s** | **-7.4%** | All stages ≥ CPU parity |

Per-stage at threshold 2^20: root rollup 47.6 → 35.4 s (**-25%**; its 2^22–2^24 MSMs
drop from 17.1 s to 4.5 s), checkpoint-root 48.4 → 45.4 s, parity base 13.2 → 11.0 s;
AVM unchanged (columns below threshold, by design).

What the losses at lower thresholds exposed: the resident-context cache is keyed on the
points span, so every distinct span (size/offset) triggers a fresh multi-hundred-MB SRS
upload — and each replayed job is a fresh process, so nothing amortises across jobs.
One extra 2^19 MSM over a new span cost PublicTxBase +12 s at threshold 2^19. Real
prover agents keep bb processes alive across proofs, so these GPU numbers are a lower
bound; a shared resident SRS (one upload per process, MSMs over sub-spans) plus
multi-MSM stream pipelining converts the one-shot cost structure to the resident one
(2^22: 409 ms one-shot vs 197 ms resident in the isolated bench) and unlocks the
sub-threshold slice (the AVM's ~2,950 column commitments).

MSM share of the whole chain on 16 vCPU is 38% (28% on a 186-core box), so perfect MSM
offload caps the whole-chain win at ~1.6x; the measured 7.4% with per-MSM dispatch and
per-span uploads leaves most of that on the table.

**Concurrent chains (the prover-fleet shape)** — 4 chains replaying simultaneously,
4 threads each, same box:

| Config | Wall (44 jobs) | Throughput vs CPU |
|---|---:|---:|
| CPU | 496.8 s | — |
| GPU, threshold 2^20 | **361.0 s** | **1.38x** |

Under CPU contention the GPU win triples versus the uncontended single chain: the
offloaded MSMs run on an otherwise-idle device while the freed cores work on sumcheck
for other proofs. This is the realistic shape — prover agents run many jobs per box —
and it is measured with the current unoptimised per-MSM dispatch (fresh process per job,
per-span SRS re-uploads). Resident-SRS sharing and stream pipelining raise the ceiling
from here.

## bb-msm daemon results (2026-07-10, g6e.4xlarge)

`bb-msm` (src/barretenberg/msm_service/) moves GPU MSM out of the prover binaries into a
box-local daemon: one resident SRS shared by every prover process, canonical-form
scalars written zero-copy into the SHM ring by the generated `bn254_streamed` client
(ipc-codegen streamed-bytes variant + `IpcClient::send_with`), consumed in place by
`try_pippenger_bn254_canonical`. GPU errors hard-fail requests — no silent CPU fallback
in the daemon. Same tx-to-root replay fixtures as above:

| Config | Single chain | 4 concurrent chains |
|---|---:|---:|
| CPU only | 200.1 s | 496.8 s |
| In-process GPU (thr 2^20) | 185.2 s | 361.0 s |
| bb-msm daemon (GPU, SHM, serial) | 173.0 s | 332.7 s |
| **bb-msm daemon + 4-worker pool** | **170.5 s** | **302.4 s** |

Zero fallbacks in all runs. The worker pool (--workers, default 4) defers requests off
the reactor thread onto slot-affine workers — each slot owns an independent resident
context (~1.2 GB VRAM; 19.9 GB total used at 4 workers) — so concurrent clients submit
to the device in parallel: 4-chain gains another 9% over the serial daemon (39% under
CPU, 16% under in-process GPU). Single-chain is unchanged within noise, as expected. The daemon beats in-process GPU by 6.6% (single) / 7.8%
(4-chain) and CPU by 13.5% / 33% — with requests still executed strictly serially
behind one mutex and one msm_t. Remaining headroom: a context/stream pool with deferred
responders and Bn254Batch coalescing (client batch driver currently sends large MSMs
one at a time). Operational notes: `--max-clients` (default 8) sizes SHM client slots —
each slot gets its own request ring (default 512 MiB, message must fit half a ring);
`.shm` names must be bare (shm_open), `.sock` paths ≤ 108 chars.

## Batch coalescing + threshold sweep (2026-07-10)

The facade batch driver now sends all above-threshold MSMs of a proving batch as ONE
zero-copy `Bn254Batch` request (span metadata + concatenated canonical scalars blob;
grouped under the frame cap, >2^22 MSMs chunked and re-summed client-side); the daemon
fans spans across the worker pool and the last-done worker responds. Requests the
daemon rejects (e.g. non-SRS points tables caught by the fingerprint guard — the AVM
has four such MSMs) fall back locally per-request; only transport failures disable
offload for a process.

Threshold sweep on the same fixtures (daemon, 4 workers): single chain 170.5 s at
thr 2^20 vs 187.2 s at 2^16; 4-chain 302.4 s vs 334.8 s; AVM job 3.50 s (2^20, no
offload) / 4.60 s (2^16) / 3.45 s (4096, all ~2,948 columns offloaded in one coalesced
request). Conclusions: 2^20 remains the right default; coalescing brings full AVM
offload from 2x-worse (per-MSM dispatch) to parity, but tiny columns (mostly 2^0–2^11)
pay a kernel launch + reduction each, matching but not beating the CPU batch driver.
Beating it requires a fused many-small-MSM kernel (single launch over many segments),
which sppark does not provide — the remaining research item for the AVM slice, alongside
daemon-side reference-mode parsing + cudaHostRegister (removes the last host copy).

## Zero-copy + pinned-ring DMA results (2026-07-10, g6e.4xlarge)

With the daemon-side zero-copy dispatch (deferred ring release; payloads consumed in
place from the SHM ring) and the request rings cudaHostRegister'd (direct DMA, all 8
rings — needs the 16g /dev/shm the GPU devboxes now get):

| Config | Single chain | 4 chains | AVM (full offload, thr 4096) |
|---|---:|---:|---:|
| CPU only | 200.1 s | 496.8 s | 3.50 s |
| In-process GPU (thr 2^20) | 185.2 s | 361.0 s | — |
| Daemon + pool (copy-mode) | 170.5 s | 302.4 s | 3.45 s |
| **Daemon zero-copy + DMA** | **160.5 s** | **281.9 s** | **3.27 s** |

Zero fallbacks; proofs verify. The copy elimination is worth a further ~6-7% on both
chain shapes, and the fully-offloaded AVM job now clearly beats the CPU batch driver
(3.27 vs 3.50) — small-column fan-out is profitable once no copies sit in front of the
device. Cumulative: 20% under CPU on single-chain latency, 43% under CPU on 4-chain
throughput, with the remaining known headroom being a fused many-small-MSM kernel and
finer-than-request release granularity.

## Known limitations (spike scope)

- BN254 G1 only. Grumpkin needs an sppark instantiation over the swapped field pair
  (curve constant b = -17) — the fields themselves already exist in `ff/alt_bn128.hpp`.
- `batch_multi_scalar_mul` dispatches per-MSM through the resident context rather than
  as a true GPU batch; sppark's `msm_t` is serialised behind one mutex.
- GPU errors fall back to CPU silently in the facade path (`try_*` contract); the
  explicit `pippenger_bn254_oneshot` API throws instead.
- Boot-time driver install (ci3) should become a baked GPU AMI for anything durable.
