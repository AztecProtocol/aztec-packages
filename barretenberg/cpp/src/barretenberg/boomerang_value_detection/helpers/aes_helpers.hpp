/**
 * @file aes_helpers.hpp
 * @brief Helper functions for AES128 constraint validation in the static analyzer.
 * @details Traces the convert_input/convert_output byte-packing logic from aes128_constraint.cpp,
 * validates byte range constraints, and verifies output connections via the IO registry.
 *
 * The AES128 constraint packs 16 bytes into a field element:
 *   converted = 0; for each byte: converted *= 256; converted += byte;
 * This creates arithmetic gates (field_t::operator+ when both operands are non-constant).
 * We replicate this logic using field_t_helpers to find those gates in the circuit.
 */
#pragma once

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/helpers/field_t_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/range_helpers.hpp"
#include "barretenberg/dsl/acir_format/aes128_constraint.hpp"

namespace cdg {

/**
 * @brief Trace the byte-packing operation: pack 16 Field values into a single packed Field.
 * @details Replicates the convert_input/convert_output logic:
 *   converted = byte_fields[0]
 *   for i in 1..15: converted = converted * 256 + byte_fields[i]
 *
 *   field_t * constant (256) doesn't create a gate, just updates scaling.
 *   field_t + field_t creates an add gate when both are non-constant.
 *
 * @return The packed Field, or nullopt if a required gate is not found.
 */
template <typename FF, typename CircuitBuilder>
std::optional<Field<CircuitBuilder>> trace_aes_byte_packing(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                            CircuitBuilder& builder,
                                                            const std::vector<Field<CircuitBuilder>>& byte_fields)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    if (byte_fields.empty()) {
        return std::nullopt;
    }

    Field<CircuitBuilder> converted = byte_fields[0];

    for (size_t i = 1; i < byte_fields.size(); ++i) {
        // converted *= 256 (no gate, updates multiplicative_constant and additive_constant)
        field_ct const_256 = field_ct(&builder, FF(256));
        Field<CircuitBuilder> scaled{ converted.witness_index, converted.witness * const_256 };

        // converted += byte_fields[i] (creates add gate if both non-constant)
        auto result = get_add_gate_output<FF>(analyzer, builder, scaled, byte_fields[i]);
        if (!result.has_value()) {
            return std::nullopt;
        }
        converted = *result;
    }

    return converted;
}

/**
 * @brief Validate that all AES128 input/iv/key/output bytes have 8-bit range constraints.
 */
template <typename FF, typename CircuitBuilder>
bool validate_aes_byte_range_constraints(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                         CircuitBuilder& builder,
                                         const acir_format::AES128Constraint& constraint)
{
    for (const auto& input : constraint.inputs) {
        if (!input.is_constant) {
            if (!is_range_constrained_via_limb_lookup<FF>(analyzer, builder, input.index, 255)) {
                return false;
            }
        }
    }
    for (const auto& iv_elem : constraint.iv) {
        if (!iv_elem.is_constant) {
            if (!is_range_constrained_via_limb_lookup<FF>(analyzer, builder, iv_elem.index, 255)) {
                return false;
            }
        }
    }
    for (const auto& key_elem : constraint.key) {
        if (!key_elem.is_constant) {
            if (!is_range_constrained_via_limb_lookup<FF>(analyzer, builder, key_elem.index, 255)) {
                return false;
            }
        }
    }
    for (const auto& output : constraint.outputs) {
        if (!is_range_constrained_via_limb_lookup<FF>(analyzer, builder, output, 255)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Full AES128 constraint validation: range checks, conversion tracing, and output connection.
 * @details Performs three validation steps:
 * 1. Verify 8-bit range constraints on all non-constant input/iv/key/output bytes.
 * 2. Trace convert_input for each 16-byte chunk (inputs, iv, key) and convert_output for each
 *    16-byte output chunk, verifying the packing arithmetic gates exist.
 * 3. Look up the IO registry for stdlib encrypt outputs and verify assert_equal connects
 *    each stdlib output to the corresponding traced convert_output result.
 */
template <typename FF, typename CircuitBuilder>
bool validate_aes(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                  CircuitBuilder& builder,
                  const acir_format::AES128Constraint& constraint)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    // Step 1: Range constraints on all bytes
    if (!validate_aes_byte_range_constraints<FF>(analyzer, builder, constraint)) {
        return false;
    }

    // Step 2: Trace convert_input for each 16-byte chunk (inputs, iv, key)
    auto build_woc_fields = [&](const auto& woc_span, size_t count) {
        std::vector<Field<CircuitBuilder>> fields;
        fields.reserve(count);
        for (size_t i = 0; i < count; ++i) {
            fields.push_back(witness_or_constant_to_field<FF>(woc_span[i], builder));
        }
        return fields;
    };

    for (size_t i = 0; i < constraint.inputs.size(); i += 16) {
        auto fields = build_woc_fields(&constraint.inputs[i], 16);
        if (!trace_aes_byte_packing<FF>(analyzer, builder, fields).has_value()) {
            return false;
        }
    }
    if (!trace_aes_byte_packing<FF>(analyzer, builder, build_woc_fields(constraint.iv.data(), 16)).has_value()) {
        return false;
    }
    if (!trace_aes_byte_packing<FF>(analyzer, builder, build_woc_fields(constraint.key.data(), 16)).has_value()) {
        return false;
    }

    // Step 3: Trace convert_output + IO lookup + assert_equal
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

    const auto& io_map = builder.acir_opcode_io.io_map;
    auto it = io_map.find(input_indices);
    if (it == io_map.end()) {
        return false;
    }
    const auto& all_outputs = it->second;
    if (all_outputs.empty()) {
        return false;
    }
    const auto& stdlib_output_indices = all_outputs.back();

    size_t num_output_blocks = constraint.outputs.size() / 16;
    if (stdlib_output_indices.size() != num_output_blocks) {
        return false;
    }

    for (size_t block = 0; block < num_output_blocks; ++block) {
        std::vector<Field<CircuitBuilder>> byte_fields;
        byte_fields.reserve(16);
        for (size_t i = 0; i < 16; ++i) {
            uint32_t output_idx = constraint.outputs[(block * 16) + i];
            byte_fields.push_back(
                Field<CircuitBuilder>{ output_idx, field_ct::from_witness_index(&builder, output_idx) });
        }

        auto packed_output = trace_aes_byte_packing<FF>(analyzer, builder, byte_fields);
        if (!packed_output.has_value()) {
            return false;
        }

        Field<CircuitBuilder> stdlib_output{ stdlib_output_indices[block],
                                             field_ct::from_witness_index(&builder, stdlib_output_indices[block]) };
        if (!is_assert_equal_exists<FF>(analyzer, builder, stdlib_output, *packed_output)) {
            return false;
        }
    }

    return true;
}

} // namespace cdg
