// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ec_operations.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace acir_format {

/**
 * @brief Create constraints for addition of two points on the Grumpkin curve.
 *
 * @details We proceed in 2 steps:
 * 1. We reconstruct the Grumpkin points input1, input2 and input_result for which we must check input1 + input2 =
 *    input_result. The reconstruction handles all cases: has_valid_witness_assignments equal to false (write_vk
 *    scenario) and a witness predicate. If:
 *      - has_valid_witness_assignments is false, then we set input1 = input2 = input_result equal to the generator of
 *        Grumpkin
 *      - the predicate is witness false, we set input1 and input2 to be the generator of Grumpkin.
 * 2. We compute input1 + input2 and check that it agrees with input_result.
 *
 * @note We do not need to enforce in-circuit that input_result is on the curve because we check that input_result is
 * equal to result, which we know is on the curve as it is the sum of two points on the curve. In the case of predicate
 * equal to witness false, the constraint is supposed to be inactive, so we even if input_result is not checked to be on
 * the curve in this case, it is OK.
 *
 * @tparam Builder
 * @param builder
 * @param input
 * @param has_valid_witness_assignments
 */
template <typename Builder>
void create_ec_add_constraint(Builder& builder, const EcAdd& input, bool has_valid_witness_assignments)
{
    using cycle_group_ct = bb::stdlib::cycle_group<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;

    // Step 1.
    bool_ct predicate = bool_ct(to_field_ct(input.predicate, builder));

    field_ct input_result_x = field_ct::from_witness_index(&builder, input.result_x);
    field_ct input_result_y = field_ct::from_witness_index(&builder, input.result_y);
    bool_ct input_result_infinite = bool_ct(field_ct::from_witness_index(&builder, input.result_infinite));

    if (!has_valid_witness_assignments) {
        builder.set_variable(input_result_x.get_witness_index(), bb::grumpkin::g1::affine_one.x);
        builder.set_variable(input_result_y.get_witness_index(), bb::grumpkin::g1::affine_one.y);
        builder.set_variable(input_result_infinite.get_witness_index(), bb::fr(0));
    }

    cycle_group_ct input1_point = to_grumpkin_point(
        input.input1_x, input.input1_y, input.input1_infinite, has_valid_witness_assignments, predicate, builder);
    cycle_group_ct input2_point = to_grumpkin_point(
        input.input2_x, input.input2_y, input.input2_infinite, has_valid_witness_assignments, predicate, builder);
    // Note that input_result is computed by Noir and passed to bb via ACIR. Hence, it is always a valid point on
    // Grumpkin.
    cycle_group_ct input_result(input_result_x, input_result_y, input_result_infinite, /*assert_on_curve=*/false);

    // Step 2.
    cycle_group_ct result = input1_point + input2_point;

    if (!predicate.is_constant()) {
        cycle_group_ct to_be_asserted_equal = cycle_group_ct::conditional_assign(predicate, input_result, result);
        result.assert_equal(to_be_asserted_equal);
    } else {
        // The assert_equal method standardizes both points before comparing, so if either of them is the point at
        // infinity, the coordinates will be assigned to be (0,0). This is OK as long as Noir developers do not use the
        // coordinates of a point at infinity (otherwise input_result might be the point at infinity different from (0,
        // 0, true), and the fact that assert_equal passes doesn't imply anything for the original coordinates of
        // input_result).
        result.assert_equal(input_result);
    }
}

template void create_ec_add_constraint<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                const EcAdd& input,
                                                                bool has_valid_witness_assignments);
template void create_ec_add_constraint<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                               const EcAdd& input,
                                                               bool has_valid_witness_assignments);

} // namespace acir_format
