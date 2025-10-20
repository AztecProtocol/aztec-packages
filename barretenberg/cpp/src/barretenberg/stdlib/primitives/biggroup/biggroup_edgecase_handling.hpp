// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256r1_impl.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"

namespace bb::stdlib::element_default {

/**
 * @brief Compute an offset generator for use in biggroup tables
 *
 *@details Sometimes the points from which we construct the tables are going to be dependent in such a way that
 *combining them for constructing the table is not possible without handling the edgecases such as the point at infinity
 *and doubling. To avoid handling those we add multiples of this offset generator to the points.
 *
 * @param num_rounds
 */
template <typename C, class Fq, class Fr, class G>
typename G::affine_element element<C, Fq, Fr, G>::compute_table_offset_generator()
{
    constexpr typename G::affine_element offset_generator =
        get_precomputed_generators<G, "biggroup table offset generator", 1>()[0];

    return offset_generator;
}

/**
 * @brief Given two lists of points that need to be multiplied by scalars, create a new list of length +1 with original
 * points masked, but the same scalar product sum
 * @details Add (δ)G, (δ²)G, (δ³)G etc to the original points and adds a new point (δⁿ⁺¹)⋅G and scalar x to the lists.
 * By doubling the point every time, we ensure that no +-1 combination of 6 sequential elements run into edgecases.
 * Since the challenge δ not known to the prover ahead of time, it is not possible to create points that cancel out
 * the offset generators.
 */
template <typename C, class Fq, class Fr, class G>
std::pair<std::vector<element<C, Fq, Fr, G>>, std::vector<Fr>> element<C, Fq, Fr, G>::mask_points(
    const std::vector<element>& _points, const std::vector<Fr>& _scalars, const Fr& masking_scalar)
{
    std::vector<element> points;
    std::vector<Fr> scalars;
    BB_ASSERT_EQ(_points.size(), _scalars.size());

    // Get the offset generator G_offset in native and in-circuit form
    const typename G::affine_element native_offset_generator = element::compute_table_offset_generator();
    C* builder = validate_context<C>(validate_context<C>(_points), validate_context<C>(_scalars));
    const element offset_generator_element = element::from_witness(builder, native_offset_generator);
    offset_generator_element.set_origin_tag(OriginTag());

    // Start the running scalar at δ
    Fr running_scalar = masking_scalar;
    Fr last_scalar = Fr(0);

    // For each point and scalar
    for (size_t i = 0; i < _points.size(); i++) {
        scalars.push_back(_scalars[i]);
        // Convert point into point + (δⁱ⁺¹)⋅G_offset
        points.push_back(_points[i] + (offset_generator_element * running_scalar));
        // Add \frac{2ⁱ⋅scalar}{2ⁿ} to the last scalar
        last_scalar += _scalars[i] * running_scalar;
        // Double the running scalar
        running_scalar *= running_scalar;
    }

    // Add a scalar -(<(δ, δ², δ³,...,δⁿ),(scalar₀,...,scalarₙ₋₁)> / δⁿ⁺¹)
    const uint32_t n = static_cast<uint32_t>(_points.size());
    const Fr masking_coefficient = masking_scalar.pow(n + 1);
    const Fr masking_coefficient_inverse = masking_coefficient.invert();
    last_scalar *= masking_coefficient_inverse;
    scalars.push_back(-last_scalar);
    if constexpr (Fr::is_composite) {
        scalars.back().self_reduce();
    }
    // Add in-circuit G_offset to points
    points.push_back(element(offset_generator_element * masking_coefficient));

    return { points, scalars };
}

/**
 * @brief Replace all pairs (∞, scalar) by the pair (one, 0) where one is a fixed generator of the curve
 * @details This is a step in enabling our our multiscalar multiplication algorithms to hande points at infinity.
 */
template <typename C, class Fq, class Fr, class G>
std::pair<std::vector<element<C, Fq, Fr, G>>, std::vector<Fr>> element<C, Fq, Fr, G>::handle_points_at_infinity(
    const std::vector<element>& _points, const std::vector<Fr>& _scalars)
{
    C* builder = validate_context<C>(validate_context<C>(_points), validate_context<C>(_scalars));
    std::vector<element> points;
    std::vector<Fr> scalars;
    element one = element::one(builder);

    for (auto [_point, _scalar] : zip_view(_points, _scalars)) {
        bool_ct is_point_at_infinity = _point.is_point_at_infinity();
        if (is_point_at_infinity.get_value() && static_cast<bool>(is_point_at_infinity.is_constant())) {
            // if point is at infinity and a circuit constant we can just skip.
            continue;
        }
        if (_scalar.get_value() == 0 && _scalar.is_constant()) {
            // if scalar multiplier is 0 and also a constant, we can skip
            continue;
        }
        element point = _point.conditional_select(one, is_point_at_infinity);
        // For field_t (non-composite), use internal version to avoid premature normalization
        // For bigfield (composite), conditional_assign doesn't normalize anyway
        Fr scalar;
        if constexpr (!Fr::is_composite) {
            scalar = Fr::conditional_assign_internal(is_point_at_infinity, 0, _scalar);
        } else {
            scalar = Fr::conditional_assign(is_point_at_infinity, 0, _scalar);
        }

        points.push_back(point);
        scalars.push_back(scalar);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1002): if both point and scalar are constant,
        // don't bother adding constraints
    }

    return { points, scalars };
}
} // namespace bb::stdlib::element_default
