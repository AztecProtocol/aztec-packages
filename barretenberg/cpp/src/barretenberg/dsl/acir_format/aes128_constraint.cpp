#include "aes128_constraint.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "round.hpp"

namespace acir_format {

template <typename Builder> void create_aes128_constraints(Builder& builder, const AES128Constraint& constraint)
{

    const auto convert_bytes = [](uint8_t* data) {
        uint256_t converted(0);
        for (uint64_t i = 0; i < 16; ++i) {
            uint256_t to_add = uint256_t((uint64_t)(data[i])) << uint256_t((15 - i) * 8);
            converted += to_add;
        }
        return converted;
    };

    using field_ct = bb::stdlib::field_t<Builder>;
    using witness_ct = bb::stdlib::witness_t<Builder>;

    std::vector<field_ct> input;

    uint8_t iv[16];
    uint8_t key[16];

    for (const auto& witness_index_num_bits : constraint.inputs) {
        auto witness_index = witness_index_num_bits.witness;
        field_ct element = field_ct::from_witness_index(&builder, witness_index);
        input.push_back(element);
    }

    size_t i = 0;
    for (const auto& witness_index_num_bits : constraint.iv) {
        auto witness_index = witness_index_num_bits.witness;
        std::vector<uint8_t> fr_bytes(sizeof(fr));

        fr value = builder.get_variable(witness_index);

        fr::serialize_to_buffer(value, &fr_bytes[0]);

        iv[i] = fr_bytes.back();
        i++;
    }
    i = 0;
    for (const auto& witness_index_num_bits : constraint.key) {
        auto witness_index = witness_index_num_bits.witness;
        std::vector<uint8_t> fr_bytes(sizeof(fr));

        fr value = builder.get_variable(witness_index);

        fr::serialize_to_buffer(value, &fr_bytes[0]);

        key[i] = fr_bytes.back();
        i++;
    }

    field_ct key_field(witness_ct(&builder, fr(convert_bytes(key))));
    field_ct iv_field(witness_ct(&builder, fr(convert_bytes(iv))));

    const auto output_bytes = bb::stdlib::aes128::encrypt_buffer_cbc<Builder>(input, iv_field, key_field);

    for (size_t i = 0; i < output_bytes.size(); ++i) {
        builder.assert_equal(output_bytes[i].normalize().witness_index, constraint.outputs[i]);
    }
}

template void create_aes128_constraints<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                             const AES128Constraint& constraint);

template void create_aes128_constraints<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                   const AES128Constraint& constraint);

} // namespace acir_format
