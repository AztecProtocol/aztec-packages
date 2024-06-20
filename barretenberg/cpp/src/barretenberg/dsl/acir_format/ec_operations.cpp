#include "ec_operations.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/plonk_honk_shared/arithmetization/gate_data.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace acir_format {

template <typename Builder>
void create_ec_add_constraint(Builder& builder, const EcAdd& input, bool has_valid_witness_assignments)
{
    // Input to cycle_group points
    using cycle_group_ct = bb::stdlib::cycle_group<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;

    auto x1 = field_ct::from_witness_index(&builder, input.input1_x);
    auto y1 = field_ct::from_witness_index(&builder, input.input1_y);
    auto x2 = field_ct::from_witness_index(&builder, input.input2_x);
    auto y2 = field_ct::from_witness_index(&builder, input.input2_y);
    auto infinite1 = bool_ct(field_ct::from_witness_index(&builder, input.input1_infinite));
    auto infinite2 = bool_ct(field_ct::from_witness_index(&builder, input.input2_infinite));
    if (!has_valid_witness_assignments) {
        auto g1 = bb::grumpkin::g1::affine_one;
        // We need to have correct values representing points on the curve
        builder.variables[input.input1_x] = g1.x;
        builder.variables[input.input1_y] = g1.y;
        builder.variables[input.input1_infinite] = bb::fr(0);
        builder.variables[input.input2_x] = g1.x;
        builder.variables[input.input2_y] = g1.y;
        builder.variables[input.input2_infinite] = bb::fr(0);
    }
    cycle_group_ct input1_point(x1, y1, infinite1);
    cycle_group_ct input2_point(x2, y2, infinite2);
    // Addition
    cycle_group_ct result = input1_point + input2_point;
    cycle_group_ct standard_result = result.get_standard_form();
    auto x_normalized = standard_result.x.normalize();
    auto y_normalized = standard_result.y.normalize();
    auto infinite = standard_result.is_point_at_infinity().normalize();
    builder.assert_equal(x_normalized.witness_index, input.result_x);
    builder.assert_equal(y_normalized.witness_index, input.result_y);
    builder.assert_equal(infinite.witness_index, input.result_infinite);
}

template void create_ec_add_constraint<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                const EcAdd& input,
                                                                bool has_valid_witness_assignments);
template void create_ec_add_constraint<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                               const EcAdd& input,
                                                               bool has_valid_witness_assignments);

} // namespace acir_format
