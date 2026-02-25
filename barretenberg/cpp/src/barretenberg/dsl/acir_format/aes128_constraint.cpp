// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "aes128_constraint.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include <cstdint>
#include <cstdio>
#include <span>

using namespace bb;

namespace acir_format {

template <typename Builder> void create_aes128_constraints(Builder& builder, const AES128Constraint& constraint)
{

    using field_ct = bb::stdlib::field_t<Builder>;
    // Packs 16 bytes from the inputs (plaintext, iv, key) into a field element
    // Note that noir-stdlib already pads the inputs in accordance with PKCS7 padding scheme.
    BB_ASSERT(constraint.inputs.size() % 16 == 0, "Inputs must be a multiple of 16");
    const auto convert_input = [&](std::span<const WitnessOrConstant<bb::fr>, std::dynamic_extent> inputs,
                                   Builder& builder) {
        field_ct converted = 0;
        for (size_t i = 0; i < 16; ++i) {
            converted *= 256;
            field_ct byte = to_field_ct(inputs[i], builder);
            // Noir enforces bytes to be in the range [0, 255] by type declarations, however, if inputs are taken
            // from
            // ACIR directly, these ranges should be enforced by the range constraint. In case these range
            // constraints already exist we won't be paying for the extra constraint.
            byte.create_range_constraint(8);
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
            // Noir enforces bytes to be in the range [0, 255] by type declarations, however, if inputs are taken from
            // ACIR directly, these ranges should be enforced by the range constraint. In case these range constraints
            // already exist we won't be paying for the extra constraint.
            byte.create_range_constraint(8);
            converted += byte;
        }
        return converted;
    };

    // Perform the conversions from array of bytes to field elements
    std::vector<field_ct> converted_inputs;
    for (size_t i = 0; i < constraint.inputs.size(); i += 16) {
        field_ct to_add;

        to_add = convert_input(
            std::span<const WitnessOrConstant<bb::fr>, std::dynamic_extent>{ &constraint.inputs[i], 16 }, builder);

        converted_inputs.emplace_back(to_add);
    }

    std::vector<field_ct> converted_outputs;
    for (size_t i = 0; i < constraint.outputs.size(); i += 16) {
        std::span<const uint32_t, 16> outputs{ &constraint.outputs[i], 16 };
        converted_outputs.emplace_back(convert_output(outputs));
    }

    const std::vector<field_ct> output_bytes = bb::stdlib::aes128::encrypt_buffer_cbc<Builder>(
        converted_inputs, convert_input(constraint.iv, builder), convert_input(constraint.key, builder));

    if (builder.is_write_vk_mode()) {
        // Register input->output witness mapping for ACIR static analysis.
        // Key: all input/iv/key byte witness indices. Value: packed encrypt output witness indices.
        std::vector<uint32_t> input_indices;
        input_indices.reserve(constraint.inputs.size() + constraint.iv.size() + constraint.key.size());
        for (const auto& input : constraint.inputs) {
            input_indices.push_back(input.is_constant ? bb::stdlib::IS_CONSTANT : input.index);
        }
        for (const auto& iv_elem : constraint.iv) {
            input_indices.push_back(iv_elem.is_constant ? bb::stdlib::IS_CONSTANT : iv_elem.index);
        }
        for (const auto& key_elem : constraint.key) {
            input_indices.push_back(key_elem.is_constant ? bb::stdlib::IS_CONSTANT : key_elem.index);
        }
        std::vector<uint32_t> output_indices(output_bytes.size());
        std::transform(output_bytes.begin(), output_bytes.end(), output_indices.begin(), [](const auto& f) {
            return f.get_witness_index();
        });
        builder.acir_opcode_io.register_io(std::move(input_indices), std::move(output_indices));
    }

    for (size_t i = 0; i < output_bytes.size(); ++i) {
        output_bytes[i].assert_equal(converted_outputs[i]);
    }
}

template void create_aes128_constraints<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                             const AES128Constraint& constraint);

template void create_aes128_constraints<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                            const AES128Constraint& constraint);

} // namespace acir_format
