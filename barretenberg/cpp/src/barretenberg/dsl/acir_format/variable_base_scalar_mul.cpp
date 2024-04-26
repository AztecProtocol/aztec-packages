#include "variable_base_scalar_mul.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/plonk_honk_shared/arithmetization/gate_data.hpp"

namespace acir_format {

template <typename Builder> void create_variable_base_constraint(Builder& builder, const VariableBaseScalarMul& input)
{
    using cycle_group_ct = bb::stdlib::cycle_group<Builder>;
    using cycle_scalar_ct = typename bb::stdlib::cycle_group<Builder>::cycle_scalar;
    using field_ct = bb::stdlib::field_t<Builder>;

    // Computes low * P + high * 2^128 * P where P is the variable base we multiply the scalar with
    //
    // Low and high need to be less than 2^128
    // TODO(benesjan): nuke the following 4 lines
    auto x = field_ct::from_witness_index(&builder, input.pub_key_x);
    auto y = field_ct::from_witness_index(&builder, input.pub_key_y);
    grumpkin::g1::affine_element base_point_var(x.get_value(), y.get_value());
    cycle_group_ct base_point(base_point_var);

    auto point_x = field_ct::from_witness_index(&builder, input.point_x);
    auto point_y = field_ct::from_witness_index(&builder, input.point_y);
    cycle_group_ct input_point(point_x, point_y, false);

    field_ct low_as_field = field_ct::from_witness_index(&builder, input.low);
    field_ct high_as_field = field_ct::from_witness_index(&builder, input.high);
    cycle_scalar_ct scalar(low_as_field, high_as_field);
    auto result = input_point * scalar;

    builder.assert_equal(result.x.get_witness_index(), input.pub_key_x);
    builder.assert_equal(result.y.get_witness_index(), input.pub_key_y);
}

template void create_variable_base_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                   const VariableBaseScalarMul& input);
template void create_variable_base_constraint<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                         const VariableBaseScalarMul& input);

} // namespace acir_format
