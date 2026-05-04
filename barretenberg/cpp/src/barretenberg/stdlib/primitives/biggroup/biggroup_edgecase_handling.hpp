// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Suyash], commit: 553c5eb82901955c638b943065acd3e47fc918c0}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256k1_impl.hpp"
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
 *
 * @details Add G, 2G, 4G etc to the original points and adds a new point (2ⁿ)⋅G and scalar x to the lists, where G
 * is a random curve point (free witness) chosen by the prover at proof-generation time. By doubling the point
 * every time, we ensure that no +-1 combination of 6 sequential elements run into edgecases for an honest prover.
 *
 * Security argument: An honest prover samples a uniformly random G, so any ROM table entry is at infinity with
 * negligible probability. A malicious prover who picks a degenerate G cannot produce a valid proof: the circuit's
 * algebraic constraints propagate the intermediate values end-to-end, and a wrong intermediate result (from hitting
 * a special case) would cause the final MSM output to be wrong, failing the verifier's checks.
 */
template <typename C, class Fq, class Fr, class G>
std::tuple<std::vector<element<C, Fq, Fr, G>>, std::vector<Fr>, element<C, Fq, Fr, G>> element<C, Fq, Fr, G>::
    mask_points(const std::vector<element>& _points, const std::vector<Fr>& _scalars)
{
    std::vector<element> points;
    std::vector<Fr> scalars;
    BB_ASSERT_EQ(_points.size(), _scalars.size());

    // Sample a random curve point as the offset generator (free witness).
    // The prover provides this point: the circuit only constrains it to lie on the curve.
    C* builder = validate_context<C>(validate_context<C>(_points), validate_context<C>(_scalars));
    const typename G::affine_element native_offset_generator = typename G::affine_element(G::element::random_element());
    const element offset_generator_element = element::from_witness(builder, native_offset_generator);

    // Disallow offset generator G = ∞ (point at infinity) because the downstream ROM table logic relies on
    // none of the points being at infinity. If we allow any point to be at infinity in ROM table construction,
    // a malicious prover can cause the output of the MSM to be wrong.
    offset_generator_element.is_point_at_infinity().assert_equal(
        false, "mask_points: offset generator must not be the point at infinity");

    auto empty_tag = OriginTag::constant(); // Disable origin checking during intermediate operations
    offset_generator_element.set_origin_tag(empty_tag);

    element running_point = offset_generator_element;

    // Start the running scalar at 1
    Fr running_scalar = Fr(1);
    Fr last_scalar = Fr(0);

    // For each point and scalar
    for (size_t i = 0; i < _points.size(); i++) {
        scalars.push_back(_scalars[i]);

        // Convert point into point + (2ⁱ)⋅G_offset
        element masked = _points[i].add_internal(running_point);
        // Each masked point must also be finite, for the same ROM table reason as the offset generator above.
        masked.is_point_at_infinity().assert_equal(false,
                                                   "mask_points: masked point must not be the point at infinity");
        points.push_back(masked);

        // Add 2ⁱ⋅scalar_i to the last scalar
        last_scalar += _scalars[i] * running_scalar;

        // Double the running scalar and point for next iteration
        running_scalar += running_scalar;
        running_point = running_point.dbl_internal();
    }

    // Add a scalar -(<(1, 2, 2²,...,2ⁿ⁻¹),(scalar₀,...,scalarₙ₋₁)> / 2ⁿ)
    const uint32_t n = static_cast<uint32_t>(_points.size());
    const Fr two_power_n = Fr(2).pow(n);
    const Fr two_power_n_inverse = two_power_n.invert();
    last_scalar *= two_power_n_inverse;
    scalars.push_back(-last_scalar);
    if constexpr (Fr::is_composite) {
        scalars.back().self_reduce();
    }
    // Add in-circuit 2ⁿ·G_offset to points
    points.push_back(running_point);

    return { points, scalars, offset_generator_element };
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

        // Select either the point at infinity or the fixed generator
        element point = _point.conditional_select(one, is_point_at_infinity);

        Fr scalar;
        if constexpr (!Fr::is_composite) {
            // For field_t (non-composite), use internal version to avoid premature normalization
            scalar = Fr::conditional_assign_internal(is_point_at_infinity, 0, _scalar);
        } else {
            // For bigfield (composite), conditional_assign doesn't normalize anyway
            scalar = Fr::conditional_assign(is_point_at_infinity, 0, _scalar);
        }

        // Push the selected point and scalar to their respective vectors
        points.push_back(point);
        scalars.push_back(scalar);
    }

    return { points, scalars };
}
} // namespace bb::stdlib::element_default
