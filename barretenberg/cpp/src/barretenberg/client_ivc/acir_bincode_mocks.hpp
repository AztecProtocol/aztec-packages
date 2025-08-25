#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include <cstddef>
#include <vector>

namespace bb::acir_bincode_mocks {

const size_t BIT_COUNT = 254;

inline uint8_t hex_char_to_value(char c)
{
    if (c >= '0' && c <= '9') {
        return static_cast<uint8_t>(c - '0');
    }
    if (c >= 'a' && c <= 'f') {
        return static_cast<uint8_t>(10 + (c - 'a'));
    }
    if (c >= 'A' && c <= 'F') {
        return static_cast<uint8_t>(10 + (c - 'A'));
    }
    throw std::invalid_argument(std::string("Invalid hex character: '") + c + "'");
}

// Converts a hex string (must have even length) to a vector<uint8_t>
inline std::vector<uint8_t> hex_string_to_bytes(const std::string& str)
{
    // Allow optional "0x" or "0X" prefix
    size_t offset = 0;
    if (str.size() >= 2 && (str[0] == '0') && (str[1] == 'x' || str[1] == 'X')) {
        offset = 2;
    }
    size_t hex_len = str.size() - offset;
    // Enforce that the input string must represent exactly 32 bytes (64 hex chars)
    if (hex_len != 64) {
        throw std::invalid_argument(
            "Hex string must be exactly 64 characters (32 bytes), excluding optional 0x prefix");
    }
    std::vector<uint8_t> bytes;
    bytes.reserve(32);
    for (size_t i = 0; i < hex_len; i += 2) {
        uint8_t high = hex_char_to_value(str[offset + i]);
        uint8_t low = hex_char_to_value(str[offset + i + 1]);
        bytes.push_back(static_cast<uint8_t>((high << 4) | low));
    }
    return bytes;
}

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

    std::vector<uint8_t> one = hex_string_to_bytes("0000000000000000000000000000000000000000000000000000000000000001");
    std::vector<uint8_t> minus_one =
        hex_string_to_bytes("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000");

    Acir::Expression expr;

    // Create constraint: w0 * w1 - w2 = 0
    expr.mul_terms = { { one, Acir::Witness{ 0 }, Acir::Witness{ 1 } } }; // w0 * w1
    expr.linear_combinations = { { minus_one, Acir::Witness{ 2 } } };     // -1 * w2
    expr.q_c = hex_string_to_bytes("0000000000000000000000000000000000000000000000000000000000000000");

    Acir::Opcode::AssertZero assert_zero;
    assert_zero.value = expr;
    Acir::Opcode opcode;
    opcode.value = assert_zero;
    circuit.opcodes.push_back(opcode);

    circuit.current_witness_index = 3;
    circuit.function_name = "simple_circuit";
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
        { Witnesses::Witness{ 0 },
          hex_string_to_bytes("0000000000000000000000000000000000000000000000000000000000000002") }, // w0 = 2
        { Witnesses::Witness{ 1 },
          hex_string_to_bytes("0000000000000000000000000000000000000000000000000000000000000003") }, // w1 = 3
        { Witnesses::Witness{ 2 },
          hex_string_to_bytes("0000000000000000000000000000000000000000000000000000000000000006") } // w2 = 6
    };
    witness_stack.stack.push_back(stack_item);

    return { program.bincodeSerialize(), witness_stack.bincodeSerialize() };
}

/**
 * @brief Create a simple kernel circuit for IVC testing
 *
 * @return Serialized kernel bytecode
 */
inline std::vector<uint8_t> create_simple_kernel(size_t vk_size, bool is_init_kernel)
{
    Acir::Circuit circuit;
    // Create witnesses equal to size of a mega VK in fields.
    std::vector<Acir::FunctionInput> vk_inputs;
    for (uint32_t i = 0; i < vk_size; i++) {
        auto i_wit = std::variant<Acir::FunctionInput::Constant, Acir::FunctionInput::Witness>{
            std::in_place_type<Acir::FunctionInput::Witness>, Acir::Witness{ i }
        };
        vk_inputs.push_back(Acir::FunctionInput{ .value = i_wit });
        ;
    }

    auto vk_size_wit = std::variant<Acir::FunctionInput::Constant, Acir::FunctionInput::Witness>{
        std::in_place_type<Acir::FunctionInput::Witness>, Acir::Witness{ static_cast<uint32_t>(vk_size) }
    };
    Acir::FunctionInput key_hash{ .value = vk_size_wit };
    ;
    size_t total_num_witnesses = /* vk */ vk_size + /* key_hash */ 1;

    auto predicate_const = std::variant<Acir::FunctionInput::Constant, Acir::FunctionInput::Witness>{
        std::in_place_type<Acir::FunctionInput::Constant>,
        hex_string_to_bytes("0000000000000000000000000000000000000000000000000000000000000001")
    };
    Acir::FunctionInput predicate{ .value = predicate_const };

    // Modeled after noir-projects/mock-protocol-circuits/crates/mock-private-kernel-init/src/main.nr
    // We mock the init or tail kernels using OINK or PG respectively.
    Acir::BlackBoxFuncCall::RecursiveAggregation recursion{ .verification_key = vk_inputs,
                                                            .proof = {},
                                                            .public_inputs = {},
                                                            .key_hash = key_hash,
                                                            .proof_type = is_init_kernel ? acir_format::PROOF_TYPE::OINK
                                                                                         : acir_format::PROOF_TYPE::PG,
                                                            .predicate = predicate };

    Acir::BlackBoxFuncCall black_box_call;
    black_box_call.value = recursion;

    circuit.opcodes.push_back(Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ black_box_call } });
    circuit.current_witness_index = static_cast<uint32_t>(total_num_witnesses);
    circuit.function_name = "simple_circuit";

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
        kernel_witness.stack.back().witness.value[Witnesses::Witness{ i }] = hex_string_to_bytes(ss.str());
    }
    std::stringstream ss;
    ss << crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(app_vk_fields);
    kernel_witness.stack.back().witness.value[Witnesses::Witness{ static_cast<uint32_t>(app_vk_fields.size()) }] =
        hex_string_to_bytes(ss.str());

    return kernel_witness.bincodeSerialize();
}

} // namespace bb::acir_bincode_mocks
