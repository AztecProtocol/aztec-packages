#pragma once

// Build-time gated hook that delegates BN254 batch MSM to a WebGPU host
// (the bb.js bridge). Only compiled into the WASM artifact when
// BBERG_WEBGPU_MSM_HOOK is defined — every other build path uses the
// native Pippenger in scalar_multiplication.cpp unchanged.
//
// Even with the hook compiled in, the delegation is opt-in at runtime
// via bb_set_webgpu_msm_enabled. The default is OFF so a WASM that has
// no WebGPU host installed (e.g. running under Node, or in a tab where
// the bridge wasn't wired up) still routes through the native Pippenger
// and never attempts to call the JS imports.
//
// See barretenberg/ts/src/msm_webgpu/ for the JS side of this boundary
// and WEBGPU_BBERG_INTEGRATION_PLAN.md for the architecture overview.

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"

// Per-MSM size at or above which an individual MSM is delegated to the
// WebGPU host. Below this size the JS bridge round-trip and GPU warmup
// typically dominate the wall time vs the in-tree single-threaded WASM
// Pippenger, so we stay on the native path. Override at configure time
// with -DWEBGPU_MSM_THRESHOLD=<value>; 2^14 is the default break-even
// for the MegaFlavor commitments that dominate Chonk proving.
#ifndef WEBGPU_MSM_THRESHOLD
#define WEBGPU_MSM_THRESHOLD (1u << 14)
#endif

namespace bb::scalar_multiplication {

inline constexpr std::size_t webgpu_msm_threshold = static_cast<std::size_t>(WEBGPU_MSM_THRESHOLD);

// Runtime gate. Even when the hook is compiled in, callers must opt in
// from JS via bb_set_webgpu_msm_enabled(1). Defaults to false so a WASM
// without a wired-up WebGPU host never tries to call the bridge import.
bool webgpu_msm_runtime_enabled() noexcept;

// CSV-measurement mode. When set, `MSM::batch_multi_scalar_mul` runs every
// MSM solo (no batching across threads) and emits a `[msm-csv-cpu]` log line
// per MSM with the polynomial name + n + cpu_ms. Toggled at runtime from JS
// via `bb_set_msm_csv_mode(uint8_t)`.
bool msm_csv_mode_enabled() noexcept;

// Monotonic per-MSM sequence (reset when csv mode is enabled). Used to make the
// CSV-mode labels unique and to correlate the CPU pass with the GPU pass.
uint64_t next_msm_seq() noexcept;

// True when oracle route-mask mode is active (bb_webgpu_route_enable(1)).
bool webgpu_oracle_route_mode_enabled() noexcept;

// Advance the per-MSM seq counter by n. A batch that bypasses the hook (e.g.
// handle_edge_cases, computed natively) calls this so the seq stays aligned with
// csv-mode, which assigns a seq to every MSM.
void advance_msm_seq(uint64_t n) noexcept;

// Per-MSM delegation predicate — runtime gate AND size at or above the
// configured threshold. Each MSM in a batch decides independently.
inline bool webgpu_msm_should_delegate(std::size_t n) noexcept
{
    return webgpu_msm_runtime_enabled() && n >= webgpu_msm_threshold;
}

// JS-implemented imports. WASM_IMPORT marks them as
// import_module="env" / import_name="<name>", so wasm-ld emits them as
// WebAssembly imports instead of failing the link with an undefined-
// symbol error. The bb.js bridge merges its stub into the `env` import
// object at instantiation time.
//
// Layout contract (all little-endian, NOT in Montgomery form):
//   points  — n × 64 bytes, [x[32] || y[32]] per point; pass NULL when the
//             MSM's points are a prefix of the published SRS starting at
//             `srs_offset` (the common case for every prover commit)
//   scalars — n × 32 bytes (Fr)
//   result  — num_windows × 64 bytes: the per-window sums, [x[32] || y[32]] each
//   srs_offset — point-index offset into the published SRS pool; only consulted
//                when points==nullptr. Lets a single uploaded SRS serve every
//                polynomial commitment regardless of its `start_index`.
//
// Returns (num_windows << 16) | c — the per-window-sum count and the Pippenger
// window-bit width. `combine_windows` (webgpu_msm_marshalling.hpp) Horner-folds
// the result region into the final affine point.
WASM_IMPORT("bb_external_msm_bn254")
uint32_t bb_external_msm_bn254(
    const uint8_t* points, const uint8_t* scalars, uint32_t n, uint8_t* result, uint32_t srs_offset);

// Batched-MSM bridge entry. Runs every MSM in a batch as one GPU submit +
// one mapAsync wait, collapsing N × ~10–30 ms of per-call Chrome polling
// latency into a single wait. Used by the wrapper below — every commit batch
// from `CommitmentKey::batch_commit` rides this one call when WebGPU is on.
//
// Layout:
//   descriptors[i] = (n, srs_offset, scalars_byte_off, result_byte_off,
//                     reserved=0) packed as 5 × u32 = 20 bytes per MSM
//   scalars_base   — packed LE non-Montgomery Fr bytes (n_i × 32 per MSM,
//                    starting at `scalars_base + descriptors[i].scalars_byte_off`)
//   results_base   — per-MSM windowSums region (numWindows_i × 64 bytes per
//                    MSM, starting at `results_base + descriptors[i].result_byte_off`)
//   meta_base      — `batch_count × 8` bytes: (num_windows: u32, c: u32) per MSM,
//                    written back by the host so the C++ side knows how to
//                    Horner-combine each MSM
// `labels_packed` is an optional pointer to per-MSM labels for telemetry.
// Encoded as `batch_count` consecutive records, each `u8 length + length bytes
// (ASCII)`. NULL → no labels. The bridge logs per-MSM `[msm-time]` lines with
// the label so you can correlate `W_L / Z_PERM / …` to GPU compute time.
WASM_IMPORT("bb_external_batch_msm_bn254")
void bb_external_batch_msm_bn254(uint32_t batch_count,
                                 const uint8_t* descriptors,
                                 const uint8_t* scalars_base,
                                 uint8_t* results_base,
                                 uint8_t* meta_base,
                                 const uint8_t* labels_packed);

// Async (overlapping) variant of the batched-MSM bridge, for CPU/GPU work-sharing
// (CPU_GPU_WORKSHARE_PLAN.md §4b). `_start` posts the same request as
// `bb_external_batch_msm_bn254` but RETURNS IMMEDIATELY (the worker does not block);
// the host runs the GPU pipeline while the C++ side computes the CPU-routed MSMs
// (and any per-MSM CPU slices) inline on the worker pool. `_await` then blocks
// until the host has written all results + meta into the buffers passed to
// `_start`. Safe because the prover's WASM memory is SHARED (threaded build): it
// grows in place, so the host's views of the descriptor/scalar/result regions are
// never detached by the worker's concurrent allocations, and the regions the two
// sides touch are read-only inputs / disjoint result slots.
WASM_IMPORT("bb_external_batch_msm_bn254_start")
void bb_external_batch_msm_bn254_start(uint32_t batch_count,
                                       const uint8_t* descriptors,
                                       const uint8_t* scalars_base,
                                       uint8_t* results_base,
                                       uint8_t* meta_base,
                                       const uint8_t* labels_packed);

WASM_IMPORT("bb_external_batch_msm_bn254_await")
void bb_external_batch_msm_bn254_await();

// SRS publisher. May be called more than once per session — every call uploads
// (or re-uploads) a new SRS pool, discarding any previously-uploaded one. Used
// by `webgpu_register_full_srs_bn254` to push the full monomial-points table
// from the CommitmentKey the first time we see one (so every later MSM is a
// prefix-with-offset of that one pool).
WASM_IMPORT("bb_publish_srs_bn254")
void bb_publish_srs_bn254(const uint8_t* points, uint32_t n);

// Register the full monomial-points SRS held by the commit-key with the GPU
// hook. Idempotent per (base, count) — does the upload only on the first
// distinct registration of a session. The hook then routes every commit as a
// prefix of this single uploaded pool, indexed by `start_index`, eliminating
// per-commit point uploads. No-op when the runtime flag is off (so a build
// with the hook compiled in but disabled at runtime pays no marshalling
// cost). Safe to call from any thread; uses atomics for the published-state
// flag.
void webgpu_register_full_srs_bn254(const curve::BN254::AffineElement* base, std::size_t count) noexcept;

// Batch wrapper. For each (points_i, scalars_i) pair in the batch,
// either runs the in-tree native Pippenger (when the per-MSM size is
// below WEBGPU_MSM_THRESHOLD or the runtime flag is off) or marshals
// inputs and invokes the JS hook. Drop-in replacement for the SRS-safe
// path of `MSM<curve::BN254>::batch_multi_scalar_mul`.
std::vector<curve::BN254::AffineElement> batch_multi_scalar_mul_webgpu_bn254(
    std::span<std::span<const curve::BN254::AffineElement>> points,
    std::span<std::span<curve::BN254::ScalarField>> scalars,
    std::span<const std::string> labels = {}) noexcept;

} // namespace bb::scalar_multiplication

#endif // BBERG_WEBGPU_MSM_HOOK
