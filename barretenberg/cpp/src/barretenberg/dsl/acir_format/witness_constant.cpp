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
    auto point_x = to_field_ct(input_x, builder);
    auto point_y = to_field_ct(input_y, builder);
    // We assume input_infinite is boolean, so we do not add a boolean gate
    bool_t infinite(&builder);
    if (!input_infinite.is_constant) {
        infinite.witness_index = input_infinite.index;
        infinite.witness_bool = get_value(input_infinite, builder) == FF::one();
    } else {
        infinite.witness_index = IS_CONSTANT;
        infinite.witness_bool = input_infinite.value == FF::one();
    }

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

} // namespace acir_format
