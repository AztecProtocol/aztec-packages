// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <vector>

namespace bb {

/**
 * @brief Wrapper around Pippenger MSM for native batch multiplication
 * @note Uses MSM::msm with handle_edge_cases=true for safe evaluation
 */
template <typename Curve>
static typename Curve::AffineElement batch_mul_native(std::span<const typename Curve::AffineElement> _points,
                                                      std::span<const typename Curve::ScalarField> _scalars)
{
    using FF = typename Curve::ScalarField;
    // Copy scalars since MSM mutates them (converts from Montgomery form)
    std::vector<FF> scalars(_scalars.begin(), _scalars.end());
    PolynomialSpan<const FF> scalar_span(0, scalars);
    return scalar_multiplication::MSM<Curve>::msm(_points, scalar_span, /*handle_edge_cases=*/true);
}

/**
 * @brief Wrapper that accepts vectors for backward compatibility
 */
template <typename Curve>
static typename Curve::AffineElement batch_mul_native(const std::vector<typename Curve::AffineElement>& _points,
                                                      const std::vector<typename Curve::ScalarField>& _scalars)
{
    return batch_mul_native<Curve>(std::span<const typename Curve::AffineElement>(_points),
                                   std::span<const typename Curve::ScalarField>(_scalars));
}

/**
 * @brief Wrapper that accepts span + vector (common pattern)
 */
template <typename Curve>
static typename Curve::AffineElement batch_mul_native(std::span<const typename Curve::AffineElement> _points,
                                                      const std::vector<typename Curve::ScalarField>& _scalars)
{
    return batch_mul_native<Curve>(_points, std::span<const typename Curve::ScalarField>(_scalars));
}

} // namespace bb
