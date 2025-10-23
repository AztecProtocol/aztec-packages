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

    // Addition
    cycle_group_ct result = input1_point + input2_point;
    cycle_group_ct standard_result = result.get_standard_form();
    auto x = standard_result.x;
    auto y = standard_result.y;
    auto infinite = standard_result.is_point_at_infinity();

    if (x.is_constant()) {
        builder.fix_witness(input.result_x, x.get_value());
    } else {
        x.assert_equal(field_ct::from_witness_index(&builder, input.result_x));
    }
    if (y.is_constant()) {
        builder.fix_witness(input.result_y, y.get_value());
    } else {
        y.assert_equal(field_ct::from_witness_index(&builder, input.result_y));
    }
    if (infinite.is_constant()) {
        builder.fix_witness(input.result_infinite, infinite.get_value());
    } else {
        infinite.assert_equal(bool_ct::from_witness_index_unsafe(&builder, input.result_infinite));
    }
}

template void create_ec_add_constraint<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                const EcAdd& input,
                                                                bool has_valid_witness_assignments);
template void create_ec_add_constraint<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                               const EcAdd& input,
                                                               bool has_valid_witness_assignments);

} // namespace acir_format
