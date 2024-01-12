#include "ec_operations.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/proof_system/arithmetization/gate_data.hpp"

namespace acir_format {

template <typename Builder>
void create_ec_add_constraint(Builder& builder, const EcAdd& input, bool has_valid_witness_assignments)
{
    // Input to cycle_group points
    using cycle_group_ct = proof_system::plonk::stdlib::cycle_group<Builder>;
    using field_ct = proof_system::plonk::stdlib::field_t<Builder>;
    auto x1 = field_ct::from_witness_index(&builder, input.input1_x);
    auto y1 = field_ct::from_witness_index(&builder, input.input1_y);
    auto x2 = field_ct::from_witness_index(&builder, input.input2_x);
    auto y2 = field_ct::from_witness_index(&builder, input.input2_y);
    if (!has_valid_witness_assignments) {
        auto g1 = cycle_group_ct(grumpkin::g1::affine_one);
        x1 = g1.x;
        y1 = g1.y;
        x2 = g1.x;
        y2 = g1.y;
        x1.convert_constant_to_fixed_witness(&builder);
        y1.convert_constant_to_fixed_witness(&builder);
        x2.convert_constant_to_fixed_witness(&builder);
        y2.convert_constant_to_fixed_witness(&builder);
    }

    cycle_group_ct input1_point(x1, y1, false);
    // grumpkin::g1::affine_element input2_point_var(x2.get_value(), y2.get_value());
    cycle_group_ct input2_point(x2, y2, false);

    // Addition
    cycle_group_ct result = input1_point + input2_point;

    if (has_valid_witness_assignments) {
        builder.assert_equal(result.x.get_witness_index(), input.result_x);
        builder.assert_equal(result.y.get_witness_index(), input.result_y);
    } else {
        builder.assert_equal(input.input1_x, input.result_x);
        builder.assert_equal(input.input1_y, input.result_y);
    }
}

template void create_ec_add_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                            const EcAdd& input,
                                                            bool has_valid_witness_assignments);
template void create_ec_add_constraint<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                  const EcAdd& input,
                                                                  bool has_valid_witness_assignments);

template <typename Builder>
void create_ec_double_constraint(Builder& builder, const EcDouble& input, bool has_valid_witness_assignments)
{
    using cycle_group_ct = proof_system::plonk::stdlib::cycle_group<Builder>;
    using field_ct = proof_system::plonk::stdlib::field_t<Builder>;
    // Input to cycle_group point

    auto x = field_ct::from_witness_index(&builder, input.input_x);
    auto y = field_ct::from_witness_index(&builder, input.input_y);

    if (!has_valid_witness_assignments) {
        auto g1 = cycle_group_ct(grumpkin::g1::affine_one);
        x = g1.x;
        y = g1.y;
        x.convert_constant_to_fixed_witness(&builder);
        y.convert_constant_to_fixed_witness(&builder);
    }

    cycle_group_ct input_point(x, y, false);
    // Doubling
    cycle_group_ct result = input_point.dbl();

    if (has_valid_witness_assignments) {
        builder.assert_equal(result.x.get_witness_index(), input.result_x);
        builder.assert_equal(result.y.get_witness_index(), input.result_y);
    } else {
        builder.assert_equal(input.input_x, input.result_x);
        builder.assert_equal(input.input_y, input.result_y);
    }
}

template void create_ec_double_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                               const EcDouble& input,
                                                               bool has_valid_witness_assignments);
template void create_ec_double_constraint<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                     const EcDouble& input,
                                                                     bool has_valid_witness_assignments);

} // namespace acir_format
