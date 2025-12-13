#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include <cstddef>
#include <stdexcept>
#include <string>
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
inline std::pair<std::vector<uint8_t>, std::vector<uint8_t>> create_simple_circuit_bytecode(size_t num_constraints = 1)
{
    std::vector<bb::fr> witness_values;

    // Acir representation of a circuit
    Acir::Circuit circuit;

    // No public inputs
    circuit.public_parameters = Acir::PublicInputs{ {} };

    std::vector<uint8_t> one = bb::fr::one().to_buffer();
    std::vector<uint8_t> minus_one = bb::fr(-1).to_buffer();

    // Add num_constraints identical constraints, each using different witnesses
    for (size_t i = 0; i < num_constraints; ++i) {
        Acir::Expression expr;

        // Create constraint: w[index] * w[index+1] - w[index+2] = 0
        bb::fr a = bb::fr(2);
        bb::fr b = bb::fr(3);
        bb::fr c = a * b;
        uint32_t a_idx = acir_format::add_to_witness_and_track_indices(witness_values, a);
        uint32_t b_idx = acir_format::add_to_witness_and_track_indices(witness_values, b);
        uint32_t c_idx = acir_format::add_to_witness_and_track_indices(witness_values, c);

        expr.mul_terms = { { one, Acir::Witness{ a_idx }, Acir::Witness{ b_idx } } };
        expr.linear_combinations = { { minus_one, Acir::Witness{ c_idx } } };
        expr.q_c = bb::fr::zero().to_buffer();

        Acir::Opcode::AssertZero assert_zero;
        assert_zero.value = expr;
        Acir::Opcode opcode;
        opcode.value = assert_zero;
        circuit.opcodes.push_back(opcode);
    }

    circuit.current_witness_index = static_cast<uint32_t>(witness_values.size());
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

    // For each constraint, add witnesses: w[i*3]=2, w[i*3+1]=3, w[i*3+2]=6 (so 2*3=6)
    uint32_t witness_idx = 0;
    for (size_t i = 0; i < num_constraints; ++i) {
        for (size_t j = 0; j < 3; ++j) {
            stack_item.witness.value[Witnesses::Witness{ witness_idx }] = witness_values[witness_idx].to_buffer();
            witness_idx++;
        }
    }
    witness_stack.stack.push_back(stack_item);

    return { program.bincodeSerialize(), witness_stack.bincodeSerialize() };
}

/**
 * @brief Create a witness for a simple circuit with given values
 * @details Creates witness data for a circuit with num_constraints constraints.
 *          Each constraint is: a * b = c
 * @param a First multiplicand for each constraint
 * @param b Second multiplicand for each constraint
 * @param num_constraints Number of constraints in the circuit (must match circuit)
 * @return Serialized witness data
 */
inline std::vector<uint8_t> create_witness_for_simple_circuit(bb::fr a, bb::fr b, size_t num_constraints = 1)
{
    bb::fr c = a * b;

    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item{};

    // For each constraint, add witnesses: w[i*3]=a, w[i*3+1]=b, w[i*3+2]=c
    uint32_t witness_idx = 0;
    for (size_t i = 0; i < num_constraints; ++i) {
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] = a.to_buffer();
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] = b.to_buffer();
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] = c.to_buffer();
    }
    witness_stack.stack.push_back(stack_item);

    return witness_stack.bincodeSerialize();
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
    // We mock the init or tail kernels using OINK or HN respectively.
    Acir::BlackBoxFuncCall::RecursiveAggregation recursion{ .verification_key = vk_inputs,
                                                            .proof = {},
                                                            .public_inputs = {},
                                                            .key_hash = key_hash,
                                                            .proof_type = is_init_kernel ? acir_format::PROOF_TYPE::OINK
                                                                                         : acir_format::PROOF_TYPE::HN,
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
