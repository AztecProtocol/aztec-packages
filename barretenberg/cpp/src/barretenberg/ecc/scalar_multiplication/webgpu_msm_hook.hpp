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

// Trace mode. When set, every production `MSM::batch_multi_scalar_mul` dispatch
// emits a `[msm-span] t0_us=… t1_us=… count=… n=… labels=…` log line whose
// timestamps are relative to the first span of the run — a prove-relative
// wall-clock timeline of the MSM phase, the WASM counterpart to the WebGPU
// bridge's aligned Perfetto trace. Purely additive (one log line per batch
// call). Toggled at runtime from JS via `bb_set_msm_trace_mode(uint8_t)`.
bool msm_trace_mode_enabled() noexcept;
void set_msm_trace_mode(bool on) noexcept;

// Distribution-capture mode. When set, every call to `MSM::batch_multi_scalar_mul`
// emits a `[msm-dist]` log line per MSM summarising the scalar distribution:
// nnz / density / Booth-recoded bucket histogram stats at `c = pick_c(n)`. Used
// to classify columns by sparsity / bucket-collision pressure before deciding
// which polynomials are safe to delegate to the WebGPU pair-tree pipeline
// (which has no point-at-infinity / dx==0 handling — see msm_v2.ts:20-23).
// Purely additive: does not change the MSM result, only logs. Toggled at
// runtime from JS via `bb_set_msm_distribution_mode(uint8_t)`. Off by default.
bool msm_distribution_mode_enabled() noexcept;

// Add `ns` to the cumulative BN254 MSM-phase wall-clock accumulator. Called once
// per MSM::batch_multi_scalar_mul dispatch (production path). Read back via the
// bb_emit_msm_phase WASM export (logs `[msm-phase-total] ms=…`). Lets the page
// report the exact cumulative MSM-phase time for a WASM run vs a WebGPU run.
void msm_phase_add_ns(uint64_t ns) noexcept;

// Runtime block-list of polynomial (label, size) pairs that should never be
// delegated to the WebGPU bridge even when `webgpu_msm_runtime_enabled() == true`.
// Used for two distinct reasons:
//   1. Pair-tree-hostile distributions — selectors (`VK_PRECOMPUTED_POLY`) and
//      small-integer counters (`LOOKUP_READ_TAGS`, `LOOKUP_READ_COUNTS`) where
//      every scalar lands in one bucket and the GPU pair tree has no margin.
//   2. Empirical no-win (label, n) pairs — same-label MSMs are great at one
//      size and a wash at another (e.g. W_L is 4.3x at n=43314 but 1.24x at
//      n=88899, where the WASM Pippenger is already saturating threads). For
//      those the GPU spends real `prepare` time for no gain.
//
// Each entry is either "LABEL" (block at any size) or "LABEL@N" (block only
// when `n == N`). `is_label_blocked(label, n)` is queried per-MSM inside
// `batch_multi_scalar_mul_webgpu_bn254` after the size threshold check; a
// `true` return routes that MSM through the inline native Pippenger instead
// of the GPU batch. Default empty (no labels blocked).
bool is_label_blocked(std::string_view label, std::size_t n) noexcept;

// Set the block-list from a comma-separated list of entries. Each entry is
// either "LABEL" (block every size of that label) or "LABEL@N" (block only
// `n == N` of that label). Empty string clears the list. Labels must not
// contain `,` or `@`; matching is exact against the per-MSM telemetry name
// passed down from `commit_and_send_to_verifier(..., labels)`.
void set_webgpu_msm_blocklist(std::string_view labels_csv) noexcept;

// Emit one `[msm-dist] name=… n=… nnz=… density=… c=… maxbucket=… p99bucket=…
// mean_nonzero_bucket=…` line per MSM in `scalars`. `labels` is optional;
// each entry that lacks a matching label logs `name=?`. Computes the level-0
// Booth-recoded per-window bucket histogram across all c-bit windows of every
// scalar (host mirror of msm_v2.ts:buildInitCounts) and aggregates over the
// nonzero buckets (excluding bucket 0, the zero-digit slot which the pair
// tree skips). Single-threaded; ~70 ms total at the canonical Chonk flow's
// ~91 MSMs.
void emit_msm_distribution(std::span<std::span<curve::BN254::ScalarField>> scalars,
                           std::span<const std::string> labels) noexcept;

// Emit one `[msm-span]` line for a single `batch_multi_scalar_mul` dispatch.
// `t0_abs_ns`/`t1_abs_ns` are absolute `steady_clock` nanoseconds bracketing the
// call; they are rebased to the first span of the run (lazily anchored) so the
// emitted `t0_us`/`t1_us` form a prove-relative timeline. `count` is the number
// of MSMs in the batch, `n_total` the summed point count, `labels` their
// telemetry names (joined, bounded). Only called when `msm_trace_mode_enabled()`.
void emit_msm_span(
    uint64_t t0_abs_ns, uint64_t t1_abs_ns, size_t count, size_t n_total, std::span<const std::string> labels) noexcept;

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
