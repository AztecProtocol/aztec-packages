#include "aes128_constraint.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"

namespace acir_format {

template <typename Builder> void create_aes128_constraints(Builder& builder, const AES128Constraint& constraint)
{

    using field_ct = bb::stdlib::field_t<Builder>;

    // Packs 16 bytes from the inputs (plaintext, iv, key) into a field element
    const auto convert_input = [&](std::span<const AES128Input, 16> inputs) {
        field_ct converted = 0;
        for (const auto& input : inputs) {
            converted *= 256;
            field_ct byte = field_ct::from_witness_index(&builder, input.witness);
            converted += byte;
        }
        return converted;
    };

    // Packs 16 bytes from the outputs (witness indexes) into a field element for comparison
    const auto convert_output = [&](std::span<const uint32_t, 16> outputs) {
        field_ct converted = 0;
        for (const auto& output : outputs) {
            converted *= 256;
            field_ct byte = field_ct::from_witness_index(&builder, output);
            converted += byte;
        }
        return converted;
    };

    // Check input is multiple of 16. Plaintext is expected to be prepadded, preferably using PKCS7
    ASSERT(constraint.inputs.size() % 16 == 0);

    // Perform the conversions from array of bytes to field elements
    std::vector<field_ct> converted_inputs;
    for (size_t i = 0; i < constraint.inputs.size(); i += 16) {
        std::span<const AES128Input, 16> inputs{ &constraint.inputs[i], 16 };
        converted_inputs.emplace_back(convert_input(inputs));
    }

    std::vector<field_ct> converted_outputs;
    for (size_t i = 0; i < constraint.outputs.size(); i += 16) {
        std::span<const uint32_t, 16> outputs{ &constraint.outputs[i], 16 };
        converted_outputs.emplace_back(convert_output(outputs));
    }

    const std::vector<field_ct> output_bytes = bb::stdlib::aes128::encrypt_buffer_cbc<Builder>(
        converted_inputs, convert_input(constraint.iv), convert_input(constraint.key));

    for (size_t i = 0; i < output_bytes.size(); ++i) {
        builder.assert_equal(output_bytes[i].normalize().witness_index, converted_outputs[i].normalize().witness_index);
    }
}

template void create_aes128_constraints<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                             const AES128Constraint& constraint);

template void create_aes128_constraints<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                   const AES128Constraint& constraint);

} // namespace acir_format
