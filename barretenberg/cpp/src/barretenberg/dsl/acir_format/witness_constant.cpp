// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "witness_constant.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Convert inputs representing a Grumpkin point into a cycle_group element.
 * @details Inputs x, y, and is_infinite are used to construct the point. We handle two cases:
 *  1. has_valid_witness_assignments is false:  we are in a write_vk scenario. In this case, we set the point to be the
 *     generator of Grumpkin.
 *  2. predicate is a witness: we conditionally assign the point depending on the predicate; if it is witness true, we
 *     use the witnesses provided, otherwise, we set the point to be the generator of Grumpkin.
 *
 * @tparam Builder
 * @tparam FF
 * @param input_x x-coordinate of the point
 * @param input_y y-coordinate of the point
 * @param input_infinite boolean indicating if the point is at infinity
 * @param has_valid_witness_assignments boolean indicating whether a witness is provided
 * @param predicate A relevant predicate used to conditionally assign the point to a valid value
 * @param builder
 * @return bb::stdlib::cycle_group<Builder>
 */
template <typename Builder>
bb::stdlib::cycle_group<Builder> to_grumpkin_point(const WitnessOrConstant<typename Builder::FF>& input_x,
                                                   const WitnessOrConstant<typename Builder::FF>& input_y,
                                                   const WitnessOrConstant<typename Builder::FF>& input_infinite,
                                                   bool has_valid_witness_assignments,
                                                   const bb::stdlib::bool_t<Builder>& predicate,
                                                   Builder& builder)
{
    using bool_ct = bb::stdlib::bool_t<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;

    bool constant_coordinates = input_x.is_constant && input_y.is_constant;

    auto point_x = to_field_ct(input_x, builder);
    auto point_y = to_field_ct(input_y, builder);
    auto infinite = bool_ct(to_field_ct(input_infinite, builder));

    // If a witness is not provided (we are in a write_vk scenario) we ensure the coordinates correspond to a valid
    // point to avoid erroneous failures during circuit construction. We only do this if the coordinates are
    // non-constant since otherwise no variable indices exist. Note that there is no need to assign the infinite flag
    // because native on-curve checks will always pass as long x and y coordinates correspond to a valid point on
    // Grumpkin.
    if (!has_valid_witness_assignments && !constant_coordinates) {
        builder.set_variable(input_x.index, bb::grumpkin::g1::affine_one.x);
        builder.set_variable(input_y.index, bb::grumpkin::g1::affine_one.y);
    }

    // If the predicate is a non-constant witness, conditionally replace coordinates with a valid point.
    if (!predicate.is_constant()) {
        point_x = field_ct::conditional_assign(predicate, point_x, field_ct(bb::grumpkin::g1::affine_one.x));
        point_y = field_ct::conditional_assign(predicate, point_y, field_ct(bb::grumpkin::g1::affine_one.y));
        infinite = bool_ct::conditional_assign(predicate, infinite, bool_ct(false));
    } else {
        BB_ASSERT(predicate.get_value(), "Creating Grumpkin point with a constant predicate equal to false.");
    }

    cycle_group<Builder> input_point(point_x, point_y, infinite, /*assert_on_curve=*/true);
    return input_point;
}

template bb::stdlib::cycle_group<UltraCircuitBuilder> to_grumpkin_point(
    const WitnessOrConstant<UltraCircuitBuilder::FF>& input_x,
    const WitnessOrConstant<UltraCircuitBuilder::FF>& input_y,
    const WitnessOrConstant<UltraCircuitBuilder::FF>& input_infinite,
    bool has_valid_witness_assignments,
    const bb::stdlib::bool_t<UltraCircuitBuilder>& predicate,
    UltraCircuitBuilder& builder);

template bb::stdlib::cycle_group<MegaCircuitBuilder> to_grumpkin_point(
    const WitnessOrConstant<MegaCircuitBuilder::FF>& input_x,
    const WitnessOrConstant<MegaCircuitBuilder::FF>& input_y,
    const WitnessOrConstant<MegaCircuitBuilder::FF>& input_infinite,
    bool has_valid_witness_assignments,
    const bb::stdlib::bool_t<MegaCircuitBuilder>& predicate,
    MegaCircuitBuilder& builder);

/**
 * @brief Convert inputs representing a Grumpkin scalar into a cycle_scalar element.
 * @details Inputs scalar_lo and scalar_hi are used to construct the scalar. We handle two cases:
 *  1. has_valid_witness_assignments is false: we are in a write_vk scenario. In this case, we set the scalar to 1.
 *  2. predicate is a witness: we conditionally assign the scalar depending on the predicate; if it is witness true, we
 *     use the witnesses provided, otherwise, we set the scalar to 1.
 *
 * @tparam Builder
 * @param scalar_lo low 128-bit limb of the scalar
 * @param scalar_hi high 126-bit limb of the scalar
 * @param has_valid_witness_assignments boolean indicating whether a witness is provided
 * @param predicate A relevant predicate used to conditionally assign the scalar to a valid value
 * @param builder
 * @return typename bb::stdlib::cycle_group<Builder>::cycle_scalar
 */
template <typename Builder>
typename bb::stdlib::cycle_group<Builder>::cycle_scalar to_grumpkin_scalar(
    const WitnessOrConstant<typename Builder::FF>& scalar_lo,
    const WitnessOrConstant<typename Builder::FF>& scalar_hi,
    bool has_valid_witness_assignments,
    const bb::stdlib::bool_t<Builder>& predicate,
    Builder& builder)
{
    using field_ct = bb::stdlib::field_t<Builder>;
    using cycle_scalar_ct = typename bb::stdlib::cycle_group<Builder>::cycle_scalar;

    bool constant_limbs = scalar_lo.is_constant && scalar_hi.is_constant;

    auto lo_as_field = to_field_ct(scalar_lo, builder);
    auto hi_as_field = to_field_ct(scalar_hi, builder);

    // If a witness is not provided (we are in a write_vk scenario) we ensure the scalar is valid.
    // We set it to 1 (low=1, high=0). We only do this if the limbs are non-constant since otherwise
    // no variable indices exist.
    if (!has_valid_witness_assignments && !constant_limbs) {
        builder.set_variable(scalar_lo.index, bb::fr(1));
        builder.set_variable(scalar_hi.index, bb::fr(0));
    }

    // If the predicate is a non-constant witness, conditionally replace the scalar with 1.
    if (!predicate.is_constant()) {
        lo_as_field = field_ct::conditional_assign(predicate, lo_as_field, field_ct(1));
        hi_as_field = field_ct::conditional_assign(predicate, hi_as_field, field_ct(0));
    } else {
        BB_ASSERT(predicate.get_value(), "Creating Grumpkin scalar with a constant predicate equal to false.");
    }

    cycle_scalar_ct scalar(lo_as_field, hi_as_field);
    return scalar;
}

template typename bb::stdlib::cycle_group<UltraCircuitBuilder>::cycle_scalar to_grumpkin_scalar(
    const WitnessOrConstant<UltraCircuitBuilder::FF>& scalar_lo,
    const WitnessOrConstant<UltraCircuitBuilder::FF>& scalar_hi,
    bool has_valid_witness_assignments,
    const bb::stdlib::bool_t<UltraCircuitBuilder>& predicate,
    UltraCircuitBuilder& builder);

template typename bb::stdlib::cycle_group<MegaCircuitBuilder>::cycle_scalar to_grumpkin_scalar(
    const WitnessOrConstant<MegaCircuitBuilder::FF>& scalar_lo,
    const WitnessOrConstant<MegaCircuitBuilder::FF>& scalar_hi,
    bool has_valid_witness_assignments,
    const bb::stdlib::bool_t<MegaCircuitBuilder>& predicate,
    MegaCircuitBuilder& builder);

} // namespace acir_format
