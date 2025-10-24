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

template <typename Builder>
void create_ec_add_constraint(Builder& builder, const EcAdd& input, bool has_valid_witness_assignments)
{
    // Input to cycle_group points
    using cycle_group_ct = bb::stdlib::cycle_group<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;

    auto input1_point = to_grumpkin_point(
        input.input1_x, input.input1_y, input.input1_infinite, has_valid_witness_assignments, input.predicate, builder);
    auto input2_point = to_grumpkin_point(
        input.input2_x, input.input2_y, input.input2_infinite, has_valid_witness_assignments, input.predicate, builder);

    // Compute the result of the addition
    cycle_group_ct result = input1_point + input2_point;
    // AUDITTODO: Is this necessary? If so, ensure cycle_group addition always returns standard form. If not, clarify.
    result.standardize();

    // Create copy-constraints between the computed result and the expected result stored in the input witness indices
    field_ct input_result_x = field_ct::from_witness_index(&builder, input.result_x);
    field_ct input_result_y = field_ct::from_witness_index(&builder, input.result_y);
    bool_ct input_result_infinite = bool_ct(field_ct::from_witness_index(&builder, input.result_infinite));

    result.x().assert_equal(input_result_x);
    result.y().assert_equal(input_result_y);
    result.is_point_at_infinity().assert_equal(input_result_infinite);
}

template void create_ec_add_constraint<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                const EcAdd& input,
                                                                bool has_valid_witness_assignments);
template void create_ec_add_constraint<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                               const EcAdd& input,
                                                               bool has_valid_witness_assignments);

} // namespace acir_format
