// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "witness_constant.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace acir_format {

// WORKTODO: Here's what I know. The token transfer program has 4 multi_scalar_mul constraints. The second of these is
// handled differently based on the value of has_valid_witness_assignments (in other words whether we are in the dummy
// witness case used for VK construction or the actual proving scenario). I've traced the discrepancy back to a
// difference in the output of this methed (to_grumpkin_point), specifically in the value of
// input_point.is_point_at_infinity(). For the second of four multi_scalar_mul constraints, it is false in the dummy
// witness case and true in the real witness case. (The actual circuit discrepancy arises later in the conditional "if
// (modded_base_point.is_constant() && !base_point.is_point_at_infinity().get_value())" in the constructor for
// straus_lookup_table).
//
// One quirk to note here is that boot_t::get_value() is unique in that it returns (witness_bool ^ witness_inverted)
// rather than something like variables[witness_index] as other primitives do. This means that if you initialize a
// bool_t then change its witness_index or the variable pointed to by that witness_index, the value returned by
// get_value() will not be affected. This seems to be coming into play below because we constuct "bool_ct infinite"
// based on "input_infinite", which sets the witness_index of infinite to the witness_index of input_infinite. We then
// update the value pointed to by this witness_index to fr(1) (in the case where we do not have valid witness), but for
// the reason just explained this will have no effect on the result of infinite.get_value(), which is called later on in
// straus_lookup_table constructor as explained above.
//
// Once I realized this I thought, ok, the solution is to simply initialize infinite AFTER setting
// "builder.variables[input_infinite.index] = fr(1);". This DOES have the effect of causing infinite.get_value() to
// return true in the case in question, however it also becomes true in cases where it is NOT true for the valid witness
// pathway. This suggests to me that perhaps the condition for manually setting the value to fr(1) is not correct. (For
// example, in the token contract case, this change results in infinite.get_value() == true for both of the first two of
// four multi_scalar_mul constraints when it is only true for the second of four in the genuine witness case).
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
    // WORKTODO: As explained above, infinite.witness_bool and infinite.witness_inverted are set here based on
    // input_infinite and the value of infinite.get_value() will not be effected by changes to the value of the variable
    // pointed to by its witness_index (e.g. builder.variables[input_infinite.index] = fr(1);).
    auto infinite = bool_ct(to_field_ct(input_infinite, builder));

    // When we do not have the witness assignments, we set is_infinite value to true if it is not constant
    // else default values would give a point which is not on the curve and this will fail verification
    if (!has_valid_witness_assignments) {
        if (!input_infinite.is_constant) {
            builder.variables[input_infinite.index] = fr(1);
        } else if (input_infinite.value == fr::zero() && !(input_x.is_constant || input_y.is_constant)) {
            // else, if is_infinite is false, but the coordinates (x, y) are witness (and not constant)
            // then we set their value to an arbitrary valid curve point (in our case G1).
            auto g1 = bb::grumpkin::g1::affine_one;
            builder.variables[input_x.index] = g1.x;
            builder.variables[input_y.index] = g1.y;
        }
    }

    cycle_group<Builder> input_point(point_x, point_y, infinite);
    info("index = ", input_point.is_point_at_infinity().witness_index);
    // info("Value = ", builder.variables[input_point.is_point_at_infinity().witness_index]);
    info("INTERNAL: input_point.is_point_at_infinity: ", input_point.is_point_at_infinity().get_value());
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
