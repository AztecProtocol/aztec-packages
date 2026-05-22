#pragma once

// Build-time gated hook that delegates BN254 batch MSM to a WebGPU host
// (the bb.js bridge). Only compiled into the WASM artifact when
// BBERG_WEBGPU_MSM_HOOK is defined — every other build path uses the
// native Pippenger in scalar_multiplication.cpp unchanged.
//
// See barretenberg/ts/src/msm_webgpu/ for the JS side of this boundary
// and WEBGPU_BBERG_INTEGRATION_PLAN.md for the architecture overview.

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"

// Per-MSM size at or above which a batch is delegated to the WebGPU
// host. Below this, the JS bridge round-trip and GPU warmup typically
// dominate the wall time vs the in-tree single-threaded WASM Pippenger,
// so we stay on the native path. Override at configure time with
// -DBBERG_WEBGPU_MSM_MIN_N=<value>; 2^16 is the empirical break-even
// from tal-webgpu on a 2024 MacBook Pro.
#ifndef BBERG_WEBGPU_MSM_MIN_N
#define BBERG_WEBGPU_MSM_MIN_N (1u << 16)
#endif

// Per-MSM size below which an entry of a delegated batch is computed with the
// native Pippenger instead of the GPU bridge — for a small MSM the bridge
// round-trip dominates. Override with -DBBERG_WEBGPU_MSM_NATIVE_MAX_N=<value>.
#ifndef BBERG_WEBGPU_MSM_NATIVE_MAX_N
#define BBERG_WEBGPU_MSM_NATIVE_MAX_N (1u << 10)
#endif

namespace bb::scalar_multiplication {

inline constexpr std::size_t webgpu_msm_min_n = static_cast<std::size_t>(BBERG_WEBGPU_MSM_MIN_N);
inline constexpr std::size_t webgpu_msm_native_max_n = static_cast<std::size_t>(BBERG_WEBGPU_MSM_NATIVE_MAX_N);

// Returns true if at least one MSM in the batch is large enough to be
// worth routing through the WebGPU host. The current policy delegates
// the entire batch as a unit (no per-entry mix); see scalar_multiplication.cpp.
inline bool webgpu_msm_batch_should_delegate(std::span<std::span<curve::BN254::ScalarField>> scalars) noexcept
{
    for (const auto& s : scalars) {
        if (s.size() >= webgpu_msm_min_n) {
            return true;
        }
    }
    return false;
}

// JS-implemented imports. WASM_IMPORT marks them as
// import_module="env" / import_name="<name>", so wasm-ld emits them as
// WebAssembly imports instead of failing the link with an undefined-
// symbol error. The bb.js bridge merges its stub into the `env` import
// object at instantiation time.
//
// Layout contract (all little-endian, NOT in Montgomery form):
//   points  — n × 64 bytes, [x[32] || y[32]] per point; may be null when the
//             MSM's points are a prefix of the already-published SRS
//   scalars — n × 32 bytes (Fr)
//   result  — num_windows × 64 bytes: the per-window sums, [x[32] || y[32]] each
//
// Returns (num_windows << 16) | c — the per-window-sum count and the Pippenger
// window-bit width. `combine_windows` (webgpu_msm_marshalling.hpp) Horner-folds
// the result region into the final affine point.
WASM_IMPORT("bb_external_msm_bn254")
uint32_t bb_external_msm_bn254(const uint8_t* points, const uint8_t* scalars, uint32_t n, uint8_t* result);

// One-shot SRS publisher. Called the first time we route an MSM through
// the WebGPU hook. The JS side uploads the SRS to the GPU and converts it
// to the Montgomery point pool once, reused by every subsequent MSM in the
// same proving session.
WASM_IMPORT("bb_publish_srs_bn254")
void bb_publish_srs_bn254(const uint8_t* points, uint32_t n);

// Batch wrapper. For each (points_i, scalars_i) pair in the batch,
// marshals inputs into the layout above, invokes the JS hook, and
// converts the affine result back into a Montgomery-form
// `AffineElement`. Drop-in replacement for the SRS-safe path of
// `MSM<curve::BN254>::batch_multi_scalar_mul`.
std::vector<curve::BN254::AffineElement> batch_multi_scalar_mul_webgpu_bn254(
    std::span<std::span<const curve::BN254::AffineElement>> points,
    std::span<std::span<curve::BN254::ScalarField>> scalars) noexcept;

} // namespace bb::scalar_multiplication

#endif // BBERG_WEBGPU_MSM_HOOK
