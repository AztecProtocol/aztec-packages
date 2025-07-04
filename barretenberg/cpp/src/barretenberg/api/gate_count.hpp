#pragma once
#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/constants.hpp"

namespace bb {
/**
 * @brief Computes the number of Barretenberg specific gates needed to create a proof for the specific ACIR circuit.
 *
 * Communication:
 * - stdout: A JSON string of the number of ACIR opcodes and final backend circuit size.
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): split this into separate Plonk and Honk functions as
 * their gate count differs
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 */
template <typename Builder = UltraCircuitBuilder>
void gate_count(const std::string& bytecode_path,
                bool recursive,
                uint32_t honk_recursion,
                bool include_gates_per_opcode)
{
    // All circuit reports will be built into the string below
    std::string functions_string = "{\"functions\": [\n  ";
    auto constraint_systems = get_constraint_systems(bytecode_path);

    const acir_format::ProgramMetadata metadata{ .recursive = recursive,
                                                 .honk_recursion = honk_recursion,
                                                 .collect_gates_per_opcode = include_gates_per_opcode };
    size_t i = 0;
    for (const auto& constraint_system : constraint_systems) {
        acir_format::AcirProgram program{ constraint_system };
        auto builder = acir_format::create_circuit<Builder>(program, metadata);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        size_t circuit_size = builder.get_finalized_total_circuit_size();
        vinfo("Calculated circuit size in gate_count: ", circuit_size);

        // Build individual circuit report
        std::string gates_per_opcode_str;
        for (size_t j = 0; j < program.constraints.gates_per_opcode.size(); j++) {
            gates_per_opcode_str += std::to_string(program.constraints.gates_per_opcode[j]);
            if (j != program.constraints.gates_per_opcode.size() - 1) {
                gates_per_opcode_str += ",";
            }
        }

        auto result_string = format(
            "{\n        \"acir_opcodes\": ",
            program.constraints.num_acir_opcodes,
            ",\n        \"circuit_size\": ",
            circuit_size,
            (include_gates_per_opcode ? format(",\n        \"gates_per_opcode\": [", gates_per_opcode_str, "]") : ""),
            "\n  }");

        // Attach a comma if there are more circuit reports to generate
        if (i != (constraint_systems.size() - 1)) {
            result_string = format(result_string, ",");
        }

        functions_string = format(functions_string, result_string);

        i++;
    }
    std::cout << format(functions_string, "\n]}");
}

} // namespace bb
