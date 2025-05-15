// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ec_operations.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace acir_format {

// This functions assumes that:
// 1. the points are on the curve
// 2a. the points have not the same abssissa, OR
// 2b. the points are identical (same witness index or same value)
// If the points at infinity are known and constant, the function will work properly
// If not, and if the points are not identical, it is an error.
template <typename Builder>
void create_ec_add_constraint(Builder& builder, const EcAdd& input, bool has_valid_witness_assignments)
{
    // Input to cycle_group points
    using cycle_group_ct = bb::stdlib::cycle_group<Builder>;

    auto input1_point = to_grumpkin_point(
        input.input1_x, input.input1_y, input.input1_infinite, has_valid_witness_assignments, builder);
    auto input2_point = to_grumpkin_point(
        input.input2_x, input.input2_y, input.input2_infinite, has_valid_witness_assignments, builder);

    // Addition
    // Check if operands are the same
    bool x_match = false;
    if (!input1_point.x.is_constant() && !input2_point.x.is_constant()) {
        x_match = (input1_point.x.get_witness_index() == input2_point.x.get_witness_index());
    } else {
        if (input1_point.x.is_constant() && input2_point.x.is_constant()) {
            x_match = (input1_point.x.get_value() == input2_point.x.get_value());
        }
    }
    bool y_match = false;
    if (!input1_point.y.is_constant() && !input2_point.y.is_constant()) {
        y_match = (input1_point.y.get_witness_index() == input2_point.y.get_witness_index());
    } else {
        if (input1_point.y.is_constant() && input2_point.y.is_constant()) {
            y_match = (input1_point.y.get_value() == input2_point.y.get_value());
        }
    }

    cycle_group_ct result;
    // If operands are the same, we double.
    // Note that the doubling function handles the infinity case
    if (x_match && y_match) {
        result = input1_point.dbl();
    } else {

        if (input.input2_infinite.is_constant && input.input1_infinite.is_constant) {
            if (get_value(input.input1_infinite, builder) == 1) {
                // input1 is infinity, so we can just return input2
                result = input2_point;

            } else if (get_value(input.input2_infinite, builder) == 1) {
                // input2 is infinity, so we can just return input1
                result = input1_point;
            } else {
                // Runtime checks that the inputs have not the same x coordinate, as assumed by the function.
                ASSERT(input1_point.x.get_value() != input2_point.x.get_value());
                // both points are not infinity, so we can use unconditional_add
                result = input1_point.unconditional_add(input2_point);
            }
        } else {
            // Some points could be at infinity, which is not supported by the function
            ASSERT(false, "Unsupported EC ADDITION UNSAFE; is_infinite status must be known at compile time");
        }
    }

    cycle_group_ct standard_result = result.get_standard_form();
    auto x_normalized = standard_result.x.normalize();
    auto y_normalized = standard_result.y.normalize();
    auto infinite = standard_result.is_point_at_infinity().normalize();

    if (x_normalized.is_constant()) {
        builder.fix_witness(input.result_x, x_normalized.get_value());
    } else {
        builder.assert_equal(x_normalized.witness_index, input.result_x);
    }
    if (y_normalized.is_constant()) {
        builder.fix_witness(input.result_y, y_normalized.get_value());
    } else {
        builder.assert_equal(y_normalized.witness_index, input.result_y);
    }

    if (infinite.is_constant()) {
        builder.fix_witness(input.result_infinite, infinite.get_value());
    } else {
        builder.assert_equal(infinite.witness_index, input.result_infinite);
    }
}

template void create_ec_add_constraint<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                const EcAdd& input,
                                                                bool has_valid_witness_assignments);
template void create_ec_add_constraint<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                               const EcAdd& input,
                                                               bool has_valid_witness_assignments);

} // namespace acir_format
