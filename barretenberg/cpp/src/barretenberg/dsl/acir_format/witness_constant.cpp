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
 * @details Inputs x, y, and is_infinite are used to construct the point. If no valid witness is provided or if the
 * predicate is constant false, the point is set to the generator point. If the predicate is a non-constant witness, the
 * point is conditionally assigned to the generator point based on the predicate value. This ensures that the point is
 * always valid and will not trigger any on_curve assertions.
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
template <typename Builder, typename FF>
bb::stdlib::cycle_group<Builder> to_grumpkin_point(const WitnessOrConstant<FF>& input_x,
                                                   const WitnessOrConstant<FF>& input_y,
                                                   const WitnessOrConstant<FF>& input_infinite,
                                                   bool has_valid_witness_assignments,
                                                   const WitnessOrConstant<FF>& predicate,
                                                   Builder& builder)
{
    using bool_ct = bb::stdlib::bool_t<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;
    auto point_x = to_field_ct(input_x, builder);
    auto point_y = to_field_ct(input_y, builder);
    auto infinite = bool_ct(to_field_ct(input_infinite, builder));

    // Coordinates should not have mixed constancy. In the case they do, convert constant coordinate to fixed witness.
    BB_ASSERT_EQ(input_x.is_constant, input_y.is_constant, "to_grumpkin_point: Inconsistent constancy of coordinates");
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/17514): Avoid mixing constant/witness coordinates
    if (point_x.is_constant() != point_y.is_constant()) {
        if (point_x.is_constant()) {
            point_x.convert_constant_to_fixed_witness(&builder);
        } else if (point_y.is_constant()) {
            point_y.convert_constant_to_fixed_witness(&builder);
        }
    }

    bool constant_coordinates = input_x.is_constant && input_y.is_constant;

    // In a witness is not provided, or the relevant predicate is constant false, we ensure the coordinates correspond
    // to a valid point to avoid erroneous failures during circuit construction. We only do this if the coordinates are
    // non-constant since otherwise no variable indices exist.
    bool constant_false_predicate = predicate.is_constant && predicate.value == FF(0);
    if ((!has_valid_witness_assignments || constant_false_predicate) && !constant_coordinates) {
        auto one = bb::grumpkin::g1::affine_one;
        builder.set_variable(input_x.index, one.x);
        builder.set_variable(input_y.index, one.y);
    }

    // If the predicate is a non-constant witness, conditionally replace coordinates with a valid point.
    // Note: this must be done before constructing the cycle_group to avoid triggering on_curve assertions
    if (!predicate.is_constant) {
        bool_ct predicate_witness = bool_ct::from_witness_index_unsafe(&builder, predicate.index);
        auto generator = bb::grumpkin::g1::affine_one;
        point_x = field_ct::conditional_assign(predicate_witness, point_x, generator.x);
        point_y = field_ct::conditional_assign(predicate_witness, point_y, generator.y);
        bool_ct generator_is_infinity = bool_ct(&builder, generator.is_point_at_infinity());
        infinite = bool_ct::conditional_assign(predicate_witness, infinite, generator_is_infinity);
    }

    cycle_group<Builder> input_point(point_x, point_y, infinite, /*assert_on_curve=*/true);
    return input_point;
}

template bb::stdlib::cycle_group<UltraCircuitBuilder> to_grumpkin_point(const WitnessOrConstant<fr>& input_x,
                                                                        const WitnessOrConstant<fr>& input_y,
                                                                        const WitnessOrConstant<fr>& input_infinite,
                                                                        bool has_valid_witness_assignments,
                                                                        const WitnessOrConstant<fr>& predicate,
                                                                        UltraCircuitBuilder& builder);
template bb::stdlib::cycle_group<MegaCircuitBuilder> to_grumpkin_point(const WitnessOrConstant<fr>& input_x,
                                                                       const WitnessOrConstant<fr>& input_y,
                                                                       const WitnessOrConstant<fr>& input_infinite,
                                                                       bool has_valid_witness_assignments,
                                                                       const WitnessOrConstant<fr>& predicate,
                                                                       MegaCircuitBuilder& builder);

} // namespace acir_format
