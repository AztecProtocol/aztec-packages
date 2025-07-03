#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include <cstddef>
#include <vector>

namespace bb::acir_bincode_mocks {

const size_t BIT_COUNT = 254;

/**
 * @brief Helper function to create a minimal circuit bytecode and witness for testing
 * @return A pair of (circuit_bytecode, witness_data)
 *
 * The circuit implements: w0 * w1 = w2
 * Example witness: w0=2, w1=3, w2=6 (so 2*3=6)
 */
inline std::pair<std::vector<uint8_t>, std::vector<uint8_t>> create_simple_circuit_bytecode()
{
    Acir::Circuit circuit;

    // No public inputs
    circuit.public_parameters = Acir::PublicInputs{ {} };

    std::string one = "0000000000000000000000000000000000000000000000000000000000000001";
    std::string minus_one = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000";

    Acir::Expression expr;

    // Create constraint: w0 * w1 - w2 = 0
    expr.mul_terms = { { one, Acir::Witness{ 0 }, Acir::Witness{ 1 } } }; // w0 * w1
    expr.linear_combinations = { { minus_one, Acir::Witness{ 2 } } };     // -1 * w2
    expr.q_c = "0000000000000000000000000000000000000000000000000000000000000000";

    Acir::Opcode::AssertZero assert_zero;
    assert_zero.value = expr;
    Acir::Opcode opcode;
    opcode.value = assert_zero;
    circuit.opcodes.push_back(opcode);

    circuit.current_witness_index = 3;
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Unbounded{} };
    circuit.private_parameters = {};
    circuit.return_values = Acir::PublicInputs{ {} };
    circuit.assert_messages = {};

    // Create the program
    Acir::Program program;
    program.functions = { circuit };
    program.unconstrained_functions = {};

    // Create witness data
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item{};

    // w0=2, w1=3, w2=6 (so 2*3=6)
    stack_item.witness.value = {
        { Witnesses::Witness{ 0 }, "0000000000000000000000000000000000000000000000000000000000000002" }, // w0 = 2
        { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000003" }, // w1 = 3
        { Witnesses::Witness{ 2 }, "0000000000000000000000000000000000000000000000000000000000000006" }  // w2 = 6
    };
    witness_stack.stack.push_back(stack_item);

    return { program.bincodeSerialize(), witness_stack.bincodeSerialize() };
}

/**
 * @brief Create a simple kernel circuit for IVC testing
 * @param vk_size Size of the verification key
 * @param is_tail Whether this is a tail kernel (uses PG proof type) or not (uses OINK)
 * @return Serialized kernel bytecode
 */
inline std::vector<uint8_t> create_simple_kernel(size_t vk_size, bool is_init_kernel)
{
    Acir::Circuit circuit;
    std::vector<Acir::FunctionInput> vk_inputs;
    for (uint32_t i = 0; i < vk_size; i++) {
        Acir::FunctionInput input{ { Acir::ConstantOrWitnessEnum::Witness{ i } }, BIT_COUNT };
        vk_inputs.push_back(input);
    }

    // Modeled after noir-projects/mock-protocol-circuits/crates/mock-private-kernel-init/src/main.nr
    // We mock the init or tail kernels using OINK or PG respectively.
    Acir::BlackBoxFuncCall::RecursiveAggregation recursion{
        .verification_key = vk_inputs,
        .proof = {},
        .public_inputs = {},
        // NOTE: If this starts failing after key hash becomes required need to pass as witness! (possibly after the VK,
        // adding +1 to witness index below)
        .key_hash = Acir::FunctionInput{ { Acir::ConstantOrWitnessEnum::Witness{ Acir::Witness{ 0 } } }, BIT_COUNT },
        .proof_type = is_init_kernel ? acir_format::PROOF_TYPE::OINK : acir_format::PROOF_TYPE::PG
    };

    Acir::BlackBoxFuncCall black_box_call;
    black_box_call.value = recursion;

    circuit.opcodes.push_back(Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ black_box_call } });
    circuit.current_witness_index = static_cast<uint32_t>(vk_inputs.size());
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Bounded{ 3 } };

    // Create the program with the circuit
    Acir::Program program;
    program.functions = { circuit };
    // Serialize the program using bincode
    return program.bincodeSerialize();
}

/**
 * @brief Create a kernel witness for IVC testing
 * @param app_vk_fields The application verification key fields to include in witness
 * @return Serialized witness data
 */
inline std::vector<uint8_t> create_kernel_witness(const std::vector<bb::fr>& app_vk_fields)
{
    Witnesses::WitnessStack kernel_witness;
    kernel_witness.stack.push_back({});
    for (uint32_t i = 0; i < app_vk_fields.size(); i++) {
        std::stringstream ss;
        ss << app_vk_fields[i];
        kernel_witness.stack.back().witness.value[Witnesses::Witness{ i }] = ss.str();
    }
    return kernel_witness.bincodeSerialize();
}

} // namespace bb::acir_bincode_mocks
