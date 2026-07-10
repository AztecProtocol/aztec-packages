#pragma once

// bb-typed API over the CUDA MSM backend. Compiled as ordinary C++ (not by nvcc);
// converts between barretenberg types and the POD boundary in msm_gpu.hpp.

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc_gpu/msm_gpu.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <span>

namespace bb::scalar_multiplication::gpu {

// True if a usable CUDA device is present.
bool msm_available() noexcept;

// One-shot MSM including point transfer. `scalars.span[j]` multiplies
// `points[scalars.start_index + j]`, matching the CPU facade semantics.
// Requires a usable device; throws (throw_or_abort) on GPU errors.
curve::BN254::Element pippenger_bn254_oneshot(PolynomialSpan<const curve::BN254::ScalarField> scalars,
                                              std::span<const curve::BN254::AffineElement> points);

// MSM through a per-points-span resident context cache: the first call for a given
// points span uploads it to the device; subsequent calls only transfer scalars.
// Strong definition of the weak hook declared in scalar_multiplication.cpp.
// Returns false (and leaves `out` untouched) if no device is available.
bool try_pippenger_bn254(curve::BN254::Element& out,
                         PolynomialSpan<const curve::BN254::ScalarField> scalars,
                         std::span<const curve::BN254::AffineElement> points) noexcept;

// Variant for scalars ALREADY in canonical standard form (4x uint64 LE limbs each, in
// [0, r)): no Montgomery conversion or staging copy — the buffer (e.g. an SHM ring) is
// consumed in place. `scalars_canonical[j]` multiplies `points[start_index + j]`. Large
// start_index values anchor a resident context at the offset instead of zero-padding.
bool try_pippenger_bn254_canonical(curve::BN254::Element& out,
                                   size_t start_index,
                                   const uint64_t* scalars_canonical,
                                   size_t num_scalars,
                                   std::span<const curve::BN254::AffineElement> points) noexcept;

} // namespace bb::scalar_multiplication::gpu
