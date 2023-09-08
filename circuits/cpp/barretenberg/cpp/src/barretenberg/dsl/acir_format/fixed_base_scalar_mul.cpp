#include "fixed_base_scalar_mul.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/proof_system/arithmetization/gate_data.hpp"

namespace acir_format {

void create_fixed_base_constraint(Builder& builder, const FixedBaseScalarMul& input)
{

    // Computes low * G + high * 2^128 * G
    //
    // Low and high need to be less than 2^128
    field_ct low_as_field = field_ct::from_witness_index(&builder, input.low);
    field_ct high_as_field = field_ct::from_witness_index(&builder, input.high);

    low_as_field.create_range_constraint(128);
    high_as_field.create_range_constraint(128);

    field_ct pow128 = field_ct(2).pow(128);

    field_ct high_times_pow128 = high_as_field * pow128;

    auto low_point = group_ct::fixed_base_scalar_mul_g1<128>(low_as_field);
    auto high_point = group_ct::fixed_base_scalar_mul_g1<254>(high_times_pow128);

    auto result = low_point + high_point;

    builder.assert_equal(result.x.witness_index, input.pub_key_x);
    builder.assert_equal(result.y.witness_index, input.pub_key_y);
}

} // namespace acir_format
