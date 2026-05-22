// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

// Shared helpers for the K=5 q1s1 WASM-SIMD path in the three batch-inversion kernels
// (batch_affine_add_interleaved, batch_affine_double_impl, batch_normalize). Extracted so
// the dispatch condition, the threshold constant, and the inverse-split tree live in one
// place instead of being open-coded three times in element_impl.hpp.

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include <array>
#include <type_traits>

namespace bb::group_elements::k5_msm {

// Number of points below which the K=5 dispatch overhead (gather/scatter, split-tree
// inversion, lane packing) exceeds the per-mul savings — fall through to the scalar K=1
// path in that regime. Shared across all three kernels so they don't drift.
inline constexpr size_t K5_MIN_POINTS = 20;

// SIMD eligibility for the K=5 path. Currently only the BN254 base field has a
// VectorField operator* specialization; other Fq types (e.g. Grumpkin) route through the
// K=1 path. When another field gets a VectorField specialization, add it here and the
// three kernels in element_impl.hpp pick it up without further edits.
template <typename Fq>
inline constexpr bool simd_supported_v =
#if defined(__wasm_simd128__)
    std::is_same_v<Fq, bb::fq>;
#else
    false;
#endif

// Recover 5 lane inverses from the inverse of their product, via the standard prefix +
// reverse-unwind tree. 4 prefix muls + 8 unwind muls = 12 muls (the single inversion is
// the caller's responsibility — `running_inv` is passed in already inverted).
//
// Given:   acc_lanes[k] = product of lane k's contributions across the K=5 forward pass
//          running_inv  = 1 / (acc_lanes[0] * acc_lanes[1] * ... * acc_lanes[4])
// Returns: inv_lanes[k] = 1 / acc_lanes[k]
template <typename Fq>
inline std::array<Fq, 5> compute_lane_inverses(const std::array<Fq, 5>& acc_lanes, Fq running_inv) noexcept
{
    std::array<Fq, 4> prefix;
    prefix[0] = acc_lanes[0];
    prefix[1] = prefix[0] * acc_lanes[1];
    prefix[2] = prefix[1] * acc_lanes[2];
    prefix[3] = prefix[2] * acc_lanes[3];
    std::array<Fq, 5> inv_lanes;
    inv_lanes[4] = running_inv * prefix[3];
    running_inv *= acc_lanes[4];
    inv_lanes[3] = running_inv * prefix[2];
    running_inv *= acc_lanes[3];
    inv_lanes[2] = running_inv * prefix[1];
    running_inv *= acc_lanes[2];
    inv_lanes[1] = running_inv * prefix[0];
    running_inv *= acc_lanes[1];
    inv_lanes[0] = running_inv;
    return inv_lanes;
}

} // namespace bb::group_elements::k5_msm
