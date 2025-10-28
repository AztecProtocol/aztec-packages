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
 * @details We proceed in 5 steps:
 * 1. We reconstruct the Grumpkin points input1, input2 and input_result for which we must check input1 + input2 =
 *    input_result. NOTE: This step does not enforce that input1 and input2 are valid points on Grumpkin.
 * 2. If we are in write_vk mode (the builder was constructed without a valid assignment of a witness vector), we
 *    populate the fields of input1, input2 and input_result with dummy data.
 * 3. If the predicate is not constant, we conditionally assign the values of input1 and input2 to avoid failures when
 *    the constraint appears in an inactive branch (predicate is witness false). When the predicate is witness false, we
 *    set input1 = input2 equal to the generator of the Grumpkin curve.
 * 4. We check that input1 and input2 are valid points on the Grumpkin curve.
 * 5. We compute input1 + input2 and check that it agrees with input_result.
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
    field_ct input_result_x = field_ct::from_witness_index(&builder, input.result_x);
    field_ct input_result_y = field_ct::from_witness_index(&builder, input.result_y);
    bool_ct input_result_infinite = static_cast<bool_ct>(field_ct::from_witness_index(&builder, input.result_infinite));
    bool_ct predicate; // To be instantiated in Step 3 if needed.

    cycle_group_ct input1 = to_grumpkin_point_unsafe(builder, input.input1_x, input.input1_y, input.input1_infinite);
    cycle_group_ct input2 = to_grumpkin_point_unsafe(builder, input.input2_x, input.input2_y, input.input2_infinite);
    cycle_group_ct input_result(input_result_x, input_result_y, input_result_infinite, /*assert_on_curve=*/true);

    // Step 2.
    if (!has_valid_witness_assignments) {
        create_dummy_ec_add_constraint(builder, input1, input2, input_result);
    }

    // Step 3.
    if (!input.predicate.is_constant) {
        predicate = static_cast<bool_ct>(to_field_ct(input.predicate, builder));

        // Note that we do not need to assign input_result because for an honest user it passed by Noir and is always a
        // point on the curve.
        cycle_group_ct affine_one(bb::grumpkin::g1::affine_one);
        input1 = cycle_group_ct::conditional_assign(predicate, input1, affine_one);
        input2 = cycle_group_ct::conditional_assign(predicate, input2, affine_one);
    } else {
        BB_ASSERT(input.predicate.value, "Creating EcAdd constraints with a constant predicate equal to false.");
    }

    // Step 4.
    // AUDITTODO: Do we want also check that the coordinates are smaller than the field modulus?
    input1.validate_on_curve();
    input2.validate_on_curve();

    // Step 5.
    cycle_group_ct result = input1 + input2;

    if (!input.predicate.is_constant) {
        cycle_group_ct to_be_asserted_equal = cycle_group_ct::conditional_assign(predicate, input_result, result);
        result.assert_equal(to_be_asserted_equal);
    } else {
        // The assert_equal method standardizes both points before comparing, so if either of them is the point at
        // infinity, the coordinates will be assigned to be (0,0). This is OK as long as developers do not use the
        // coordinates of a point at infinity (otherwise input_result might be the point at infinity different from (0,
        // 0, true), and the fact that assert_equal passes doesn't imply anything for the original coordinates of
        // input_result).
        result.assert_equal(input_result);
    }
}

template <typename Builder>
void create_dummy_ec_add_constraint(Builder& builder,
                                    const bb::stdlib::cycle_group<Builder>& input1,
                                    const bb::stdlib::cycle_group<Builder>& input2,
                                    const bb::stdlib::cycle_group<Builder>& input_result)
{
    auto affine_one = bb::grumpkin::g1::affine_one;

    for (auto const& input : { input1, input2, input_result }) {
        if (!input.is_constant()) {
            builder.set_variable(input.x().get_witness_index(), affine_one.x);
            builder.set_variable(input.y().get_witness_index(), affine_one.y);
            builder.set_variable(input.is_point_at_infinity().get_witness_index(), false);
        }
    }
}

template void create_ec_add_constraint<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                const EcAdd& input,
                                                                bool has_valid_witness_assignments);
template void create_ec_add_constraint<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                               const EcAdd& input,
                                                               bool has_valid_witness_assignments);

template void create_dummy_ec_add_constraint<bb::UltraCircuitBuilder>(
    bb::UltraCircuitBuilder& builder,
    const bb::stdlib::cycle_group<bb::UltraCircuitBuilder>& input1,
    const bb::stdlib::cycle_group<bb::UltraCircuitBuilder>& input2,
    const bb::stdlib::cycle_group<bb::UltraCircuitBuilder>& input_result);

template void create_dummy_ec_add_constraint<bb::MegaCircuitBuilder>(
    bb::MegaCircuitBuilder& builder,
    const bb::stdlib::cycle_group<bb::MegaCircuitBuilder>& input1,
    const bb::stdlib::cycle_group<bb::MegaCircuitBuilder>& input2,
    const bb::stdlib::cycle_group<bb::MegaCircuitBuilder>& input_result);

} // namespace acir_format
