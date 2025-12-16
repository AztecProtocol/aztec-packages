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
template <typename Builder, typename FF>
bb::stdlib::cycle_group<Builder> to_grumpkin_point(const WitnessOrConstant<FF>& input_x,
                                                   const WitnessOrConstant<FF>& input_y,
                                                   const WitnessOrConstant<FF>& input_infinite,
                                                   bool has_valid_witness_assignments,
                                                   Builder& builder)
{
    using bool_ct = bb::stdlib::bool_t<Builder>;
    auto point_x = to_field_ct(input_x, builder);
    auto point_y = to_field_ct(input_y, builder);
    auto infinite = bool_ct(to_field_ct(input_infinite, builder));

    // When we do not have the witness assignments, we set is_infinite value to true if it is not constant
    // else default values would give a point which is not on the curve and this will fail verification
    if (!has_valid_witness_assignments) {
        if (!input_infinite.is_constant) {
            builder.set_variable(input_infinite.index, fr(1));
        } else if (input_infinite.value == fr::zero() && !(input_x.is_constant || input_y.is_constant)) {
            // else, if is_infinite is false, but the coordinates (x, y) are witness (and not constant)
            // then we set their value to an arbitrary valid curve point (in our case G1).
            auto g1 = bb::grumpkin::g1::affine_one;
            builder.set_variable(input_x.index, g1.x);
            builder.set_variable(input_y.index, g1.y);
        }
    }
    cycle_group<Builder> input_point(point_x, point_y, infinite);
    return input_point;
}

// Returns a valid point if the 'predicate' is a false witness
template <typename Builder, typename FF>
bb::stdlib::cycle_group<Builder> valid_point(const bb::stdlib::cycle_group<Builder>& input,
                                             const WitnessOrConstant<FF>& predicate,
                                             Builder& builder)
{
    using bool_ct = bb::stdlib::bool_t<Builder>;
    if (predicate.is_constant) {
        return input;
    }
    // creates a bool_ct from the index, without adding a boolean gate because a predicate is boolean by definition.
    bool_ct predicate_witness = bool_ct::from_witness_index_unsafe(&builder, predicate.index);

    auto generator = bb::grumpkin::g1::affine_one;
    auto point_x = field_t<Builder>::conditional_assign(predicate_witness, input.x, generator.x).normalize();
    auto point_y = field_t<Builder>::conditional_assign(predicate_witness, input.y, generator.y).normalize();
    bool_ct generator_is_infinity = bool_ct(&builder, generator.is_point_at_infinity());
    auto infinite =
        bool_ct::conditional_assign(predicate_witness, input.is_point_at_infinity(), generator_is_infinity).normalize();
    cycle_group<Builder> result(point_x, point_y, infinite);
    return result;
}

template bb::stdlib::cycle_group<UltraCircuitBuilder> to_grumpkin_point(const WitnessOrConstant<fr>& input_x,
                                                                        const WitnessOrConstant<fr>& input_y,
                                                                        const WitnessOrConstant<fr>& input_infinite,
                                                                        bool has_valid_witness_assignments,
                                                                        UltraCircuitBuilder& builder);
template bb::stdlib::cycle_group<MegaCircuitBuilder> to_grumpkin_point(const WitnessOrConstant<fr>& input_x,
                                                                       const WitnessOrConstant<fr>& input_y,
                                                                       const WitnessOrConstant<fr>& input_infinite,
                                                                       bool has_valid_witness_assignments,
                                                                       MegaCircuitBuilder& builder);
template bb::stdlib::cycle_group<UltraCircuitBuilder> valid_point(
    const bb::stdlib::cycle_group<UltraCircuitBuilder>& input,
    const WitnessOrConstant<fr>& predicate,
    UltraCircuitBuilder& builder);
template bb::stdlib::cycle_group<MegaCircuitBuilder> valid_point(
    const bb::stdlib::cycle_group<MegaCircuitBuilder>& input,
    const WitnessOrConstant<fr>& predicate,
    MegaCircuitBuilder& builder);

} // namespace acir_format
