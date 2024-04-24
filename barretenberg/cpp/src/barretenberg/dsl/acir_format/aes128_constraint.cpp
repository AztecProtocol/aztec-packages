#include "aes128_constraint.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "round.hpp"

namespace acir_format {

template <typename Builder> void create_aes128_constraints(Builder& builder, const AES128Constraint& constraint)
{
    using byte_array_ct = bb::stdlib::byte_array<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;

    // Create byte array struct
    byte_array_ct input(&builder);

    std::array<field_ct, 16> iv;
    std::array<field_ct, 16> key;

    for (const auto& witness_index_num_bits : constraint.inputs) {
        auto witness_index = witness_index_num_bits.witness;
        auto num_bits = witness_index_num_bits.num_bits;

        // TODO: Copied forom KeccakConstraint, is this really necessary?
        auto num_bytes = round_to_nearest_byte(num_bits);

        field_ct element = field_ct::from_witness_index(&builder, witness_index);
        byte_array_ct element_bytes(element, num_bytes);

        input.write(element_bytes);
    }

    size_t i = 0;
    for (const auto& witness_index_num_bits : constraint.iv) {
        auto witness_index = witness_index_num_bits.witness;
        field_ct element = field_ct::from_witness_index(&builder, witness_index);
        iv[i] = element;
        ++i;
    }
    i = 0;
    for (const auto& witness_index_num_bits : constraint.key) {
        auto witness_index = witness_index_num_bits.witness;
        field_ct element = field_ct::from_witness_index(&builder, witness_index);
        key[i] = element;
        ++i;
    }

    byte_array_ct output_bytes = bb::stdlib::aes128<Builder>::encrypt_buffer_cbc(input_arr, iv, key);

    // Convert byte array to vector of field_t
    auto bytes = output_bytes.bytes();

    for (size_t i = 0; i < bytes.size(); ++i) {
        builder.assert_equal(bytes[i].normalize().witness_index, constraint.result[i]);
    }
}

template void create_aes128_constraints<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                             const AES128Constraint& constraint);

template void create_aes128_constraints<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                   const AES128Constraint& constraint);

} // namespace acir_format
