// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "witness_constant.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Convert inputs representing a Grumpkin point into a cycle_group element.
 * @details Inputs x, y, and is_infinite are used to construct the point. The is_infinite flag is constrained to be
 * consistent with (0,0) coordinates (noir represents point at infinity as (0, 0, true)). The infinity flag is not
 * passed directly to cycle_group; instead, the constructor auto-detects infinity from (0,0) coordinates.
 *
 * We handle two special cases:
 *  1. write_vk scenario: we set the point to be the generator of Grumpkin to avoid circuit construction failures.
 *  2. predicate is a witness: we conditionally assign the point depending on the predicate; if it is witness true, we
 *     use the witnesses provided, otherwise, we set the point to be the generator of Grumpkin.
 *
 * @tparam Builder
 * @param input_x x-coordinate of the point
 * @param input_y y-coordinate of the point
 * @param input_infinite boolean indicating if the point is at infinity (must be consistent with (0,0) coordinates)
 * @param predicate A relevant predicate used to conditionally assign the point to a valid value
 * @param builder
 * @return bb::stdlib::cycle_group<Builder>
 *
 * TODO: we must get rid of input_infinite and only pass coordinates as inputs.
 */
template <typename Builder>
bb::stdlib::cycle_group<Builder> to_grumpkin_point(const WitnessOrConstant<typename Builder::FF>& input_x,
                                                   const WitnessOrConstant<typename Builder::FF>& input_y,
                                                   const WitnessOrConstant<typename Builder::FF>& input_infinite,
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
    // point to avoid erroneous failures during circuit construction. We set coordinates to the generator (a finite
    // point) and the infinity flag to false for consistency.
    if (builder.is_write_vk_mode() && !constant_coordinates) {
        builder.set_variable(input_x.index, bb::grumpkin::g1::affine_one.x);
        builder.set_variable(input_y.index, bb::grumpkin::g1::affine_one.y);
        if (!input_infinite.is_constant) {
            builder.set_variable(input_infinite.index, bb::fr(0));
        }
    }

    // If the predicate is a non-constant witness, conditionally replace coordinates with a valid point.
    if (!predicate.is_constant()) {
        point_x = field_ct::conditional_assign(predicate, point_x, field_ct(bb::grumpkin::g1::affine_one.x));
        point_y = field_ct::conditional_assign(predicate, point_y, field_ct(bb::grumpkin::g1::affine_one.y));
        infinite = bool_ct::conditional_assign(predicate, infinite, bool_ct(false));
    } else {
        BB_ASSERT(predicate.get_value(), "Creating Grumpkin point with a constant predicate equal to false.");
    }

    // Use public constructor which auto-detects infinity from (0,0) coordinates.
    cycle_group<Builder> input_point(point_x, point_y, /*assert_on_curve=*/true);
    return input_point;
}

template bb::stdlib::cycle_group<UltraCircuitBuilder> to_grumpkin_point(
    const WitnessOrConstant<UltraCircuitBuilder::FF>& input_x,
    const WitnessOrConstant<UltraCircuitBuilder::FF>& input_y,
    const WitnessOrConstant<UltraCircuitBuilder::FF>& input_infinite,
    const bb::stdlib::bool_t<UltraCircuitBuilder>& predicate,
    UltraCircuitBuilder& builder);

template bb::stdlib::cycle_group<MegaCircuitBuilder> to_grumpkin_point(
    const WitnessOrConstant<MegaCircuitBuilder::FF>& input_x,
    const WitnessOrConstant<MegaCircuitBuilder::FF>& input_y,
    const WitnessOrConstant<MegaCircuitBuilder::FF>& input_infinite,
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
    const bb::stdlib::bool_t<Builder>& predicate,
    Builder& builder)
{
    using field_ct = bb::stdlib::field_t<Builder>;
    using cycle_scalar_ct = typename bb::stdlib::cycle_group<Builder>::cycle_scalar;

    auto lo_as_field = to_field_ct(scalar_lo, builder);
    auto hi_as_field = to_field_ct(scalar_hi, builder);

    // We assert that scalar_hi is not a witness when scalar_lo is constant as this might indicate unintended behavior.
    BB_ASSERT(!(scalar_lo.is_constant && !scalar_hi.is_constant),
              "to_grumpkin_scalar: scalar_lo is constant while scalar_hi is not.");

    // If a witness is not provided (we are in a write_vk scenario) we ensure the scalar is valid.
    // We only do this if the limbs are non-constant since otherwise no variable indices exist.
    // Note: the two limbs may have different constancy, e.g. if the scalar is a witness known to be <= 128 bits.
    if (builder.is_write_vk_mode()) {
        if (!scalar_lo.is_constant) {
            builder.set_variable(scalar_lo.index, bb::fr(1));
        }
        if (!scalar_hi.is_constant) {
            builder.set_variable(scalar_hi.index, bb::fr(0));
        }
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
    const bb::stdlib::bool_t<UltraCircuitBuilder>& predicate,
    UltraCircuitBuilder& builder);

template typename bb::stdlib::cycle_group<MegaCircuitBuilder>::cycle_scalar to_grumpkin_scalar(
    const WitnessOrConstant<MegaCircuitBuilder::FF>& scalar_lo,
    const WitnessOrConstant<MegaCircuitBuilder::FF>& scalar_hi,
    const bb::stdlib::bool_t<MegaCircuitBuilder>& predicate,
    MegaCircuitBuilder& builder);

} // namespace acir_format
