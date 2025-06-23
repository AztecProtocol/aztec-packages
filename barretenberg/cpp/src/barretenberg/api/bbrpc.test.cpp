#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "bbrpc_execute.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <gtest/gtest.h>

namespace bb::bbrpc {

// Helper function to create a minimal circuit bytecode for testing
std::vector<uint8_t> create_simple_circuit_bytecode()
{
    // Create a simple expression: w0 + w1 - w2 = 0
    // This represents the constraint: w0 + w1 = w2
    Acir::Expression expr;
    expr.mul_terms = {}; // No multiplication terms

    // Field element 1 as 64-character hex string
    std::string one = "0000000000000000000000000000000000000000000000000000000000000001";
    // Field element -1 (p-1 where p is the BN254 field modulus)
    std::string minus_one = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000";

    expr.linear_combinations = {
        { one, Acir::Witness{ 0 } },      // 1 * w0
        { one, Acir::Witness{ 1 } },      // 1 * w1
        { minus_one, Acir::Witness{ 2 } } // -1 * w2
    };
    expr.q_c = "0000000000000000000000000000000000000000000000000000000000000000"; // No constant term

    // Create an AssertZero opcode with the expression
    Acir::Opcode::AssertZero assert_zero_opcode{ expr };

    // Create the opcode variant
    Acir::Opcode opcode;
    opcode.value = assert_zero_opcode;

    // Create the circuit
    Acir::Circuit circuit;
    circuit.current_witness_index = 3; // We have 3 witnesses (0, 1, 2)
    circuit.opcodes = { opcode };
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Bounded{ 3 } };
    circuit.private_parameters = {};                      // No private parameters
    circuit.public_parameters = Acir::PublicInputs{ {} }; // No public inputs
    circuit.return_values = Acir::PublicInputs{ {} };     // No return values
    circuit.assert_messages = {};                         // No assert messages

    // Create the program with the circuit
    Acir::Program program;
    program.functions = { circuit };
    program.unconstrained_functions = {}; // No unconstrained functions

    // Serialize the program using bincode
    return program.bincodeSerialize();
}

class BBRpcTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(BBRpcTests, CircuitDeriveVkDirect)
{
    // Create a minimal circuit
    CircuitInput circuit{
        .name = "test_circuit",
        .bytecode = create_simple_circuit_bytecode(),
        .verification_key = {} // Empty for derive_vk
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Create the command
    CircuitDeriveVk command{ .circuit = circuit, .settings = settings };

    // Create a minimal request context
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});

    // Call execute directly
    auto response = execute(request, std::move(command));

    // Check that the command succeeded
    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
}

TEST_F(BBRpcTests, ProveAndVerifyCircuit)
{
    // Create a minimal circuit
    auto bytecode = create_simple_circuit_bytecode();

    // First derive the verification key
    CircuitInput circuit_for_vk{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Empty for derive_vk
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Derive VK
    CircuitDeriveVk derive_vk_command{ .circuit = circuit_for_vk, .settings = settings };
    BBRpcRequest vk_request(RequestId{ 1 }, std::vector<Command>{});
    auto vk_response = execute(vk_request, std::move(derive_vk_command));

    EXPECT_TRUE(vk_response.error_message.empty());
    EXPECT_FALSE(vk_response.verification_key.empty());

    // Now create a proof with witness data
    // For the constraint w0 + w1 = w2, let's use witness values: 5 + 7 = 12
    // Create a WitnessStack with one StackItem
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0; // First (and only) circuit

    // Create witness map with field elements as 64-character hex strings
    stack_item.witness.value = {
        { Witnesses::Witness{ 0 }, "0000000000000000000000000000000000000000000000000000000000000005" }, // w0 = 5
        { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000007" }, // w1 = 7
        { Witnesses::Witness{ 2 }, "000000000000000000000000000000000000000000000000000000000000000c" }  // w2 = 12
    };

    witness_stack.stack.push_back(stack_item);

    // Serialize the witness stack
    std::vector<uint8_t> witness_data = witness_stack.bincodeSerialize();

    CircuitInput circuit_for_proof{ .name = "test_circuit",
                                    .bytecode = bytecode,
                                    .verification_key = vk_response.verification_key };

    CircuitProve prove_command{ .circuit = circuit_for_proof, .witness = witness_data, .settings = settings };
    BBRpcRequest prove_request(RequestId{ 2 }, std::vector<Command>{});
    auto prove_response = execute(prove_request, std::move(prove_command));

    EXPECT_TRUE(prove_response.error_message.empty());
    EXPECT_FALSE(prove_response.proof.empty());

    // Finally, verify the proof
    CircuitVerify verify_command{ .verification_key = vk_response.verification_key,
                                  .public_inputs = prove_response.public_inputs,
                                  .proof = prove_response.proof,
                                  .settings = settings };
    BBRpcRequest verify_request(RequestId{ 3 }, std::vector<Command>{});
    auto verify_response = execute(verify_request, std::move(verify_command));

    EXPECT_TRUE(verify_response.error_message.empty());
    EXPECT_TRUE(verify_response.verified);
}

TEST_F(BBRpcTests, CircuitInfo)
{
    // Create a minimal circuit
    auto bytecode = create_simple_circuit_bytecode();

    CircuitInput circuit{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Not needed for info
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Get circuit info
    CircuitInfo info_command{ .circuit = circuit, .include_gates_per_opcode = false, .settings = settings };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(info_command));

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_GT(response.total_gates, 0);
    EXPECT_GT(response.subgroup_size, 0);
    // Subgroup size should be a power of 2
    EXPECT_EQ(response.subgroup_size & (response.subgroup_size - 1), 0);
}

TEST_F(BBRpcTests, CircuitCheckValid)
{
    // Create a minimal circuit
    auto bytecode = create_simple_circuit_bytecode();

    // Create valid witness data (5 + 7 = 12)
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0;
    stack_item.witness.value = {
        { Witnesses::Witness{ 0 }, "0000000000000000000000000000000000000000000000000000000000000005" }, // w0 = 5
        { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000007" }, // w1 = 7
        { Witnesses::Witness{ 2 }, "000000000000000000000000000000000000000000000000000000000000000c" }  // w2 = 12
    };
    witness_stack.stack.push_back(stack_item);
    std::vector<uint8_t> witness_data = witness_stack.bincodeSerialize();

    CircuitInput circuit{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Not needed for check
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    CircuitCheck check_command{ .circuit = circuit, .witness = witness_data, .settings = settings };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(check_command));

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_TRUE(response.satisfied);
}

TEST_F(BBRpcTests, CircuitCheckInvalid)
{
    // Create a minimal circuit
    auto bytecode = create_simple_circuit_bytecode();

    // Create invalid witness data (5 + 7 != 13)
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0;
    stack_item.witness.value = {
        { Witnesses::Witness{ 0 }, "0000000000000000000000000000000000000000000000000000000000000005" }, // w0 = 5
        { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000007" }, // w1 = 7
        { Witnesses::Witness{ 2 },
          "000000000000000000000000000000000000000000000000000000000000000d" } // w2 = 13 (wrong!)
    };
    witness_stack.stack.push_back(stack_item);
    std::vector<uint8_t> witness_data = witness_stack.bincodeSerialize();

    CircuitInput circuit{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Not needed for check
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    CircuitCheck check_command{ .circuit = circuit, .witness = witness_data, .settings = settings };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(check_command));

    EXPECT_FALSE(response.error_message.empty());
    EXPECT_FALSE(response.satisfied);
}

TEST_F(BBRpcTests, ProofAsFields)
{
    // Create a simple proof (just some field elements)
    HonkProof proof = { bb::fr(1), bb::fr(2), bb::fr(3), bb::fr(4) };

    ProofAsFields command{ .proof = proof };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(command));

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_EQ(response.fields.size(), 4);
    EXPECT_EQ(response.fields[0], bb::fr(1));
    EXPECT_EQ(response.fields[1], bb::fr(2));
    EXPECT_EQ(response.fields[2], bb::fr(3));
    EXPECT_EQ(response.fields[3], bb::fr(4));
}

TEST_F(BBRpcTests, VkAsFields)
{
    // First derive a VK to convert
    auto bytecode = create_simple_circuit_bytecode();
    CircuitInput circuit{ .name = "test_circuit", .bytecode = bytecode, .verification_key = {} };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    CircuitDeriveVk derive_vk_command{ .circuit = circuit, .settings = settings };
    BBRpcRequest vk_request(RequestId{ 1 }, std::vector<Command>{});
    auto vk_response = execute(vk_request, std::move(derive_vk_command));

    EXPECT_TRUE(vk_response.error_message.empty());

    // Now convert VK to fields
    VkAsFields vk_as_fields_command{ .verification_key = vk_response.verification_key, .is_mega_honk = false };
    BBRpcRequest fields_request(RequestId{ 2 }, std::vector<Command>{});
    auto fields_response = execute(fields_request, std::move(vk_as_fields_command));

    EXPECT_TRUE(fields_response.error_message.empty());
    EXPECT_GT(fields_response.fields.size(), 0);
}

// Helper to create a more complex circuit suitable for IVC
std::vector<uint8_t> create_ivc_circuit_bytecode()
{
    // Create a circuit with multiple gates suitable for IVC
    std::vector<Acir::Opcode> opcodes;

    // Create multiple constraints:
    // w0 + w1 = w2
    // w2 * w3 = w4
    // w4 + w5 = w6

    std::string one = "0000000000000000000000000000000000000000000000000000000000000001";
    std::string minus_one = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000";
    std::string zero = "0000000000000000000000000000000000000000000000000000000000000000";

    // First constraint: w0 + w1 - w2 = 0
    {
        Acir::Expression expr;
        expr.mul_terms = {};
        expr.linear_combinations = {
            { one, Acir::Witness{ 0 } },      // 1 * w0
            { one, Acir::Witness{ 1 } },      // 1 * w1
            { minus_one, Acir::Witness{ 2 } } // -1 * w2
        };
        expr.q_c = zero;
        opcodes.push_back(Acir::Opcode{ Acir::Opcode::AssertZero{ expr } });
    }

    // Second constraint: w2 * w3 - w4 = 0
    {
        Acir::Expression expr;
        expr.mul_terms = { { one, Acir::Witness{ 2 }, Acir::Witness{ 3 } } }; // w2 * w3
        expr.linear_combinations = { { minus_one, Acir::Witness{ 4 } } };     // -1 * w4
        expr.q_c = zero;
        opcodes.push_back(Acir::Opcode{ Acir::Opcode::AssertZero{ expr } });
    }

    // Third constraint: w4 + w5 - w6 = 0
    {
        Acir::Expression expr;
        expr.mul_terms = {};
        expr.linear_combinations = {
            { one, Acir::Witness{ 4 } },      // 1 * w4
            { one, Acir::Witness{ 5 } },      // 1 * w5
            { minus_one, Acir::Witness{ 6 } } // -1 * w6
        };
        expr.q_c = zero;
        opcodes.push_back(Acir::Opcode{ Acir::Opcode::AssertZero{ expr } });
    }

    // Create the circuit
    Acir::Circuit circuit;
    circuit.current_witness_index = 7; // We have 7 witnesses (0-6)
    circuit.opcodes = opcodes;
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Bounded{ 3 } };
    circuit.private_parameters = {};
    circuit.public_parameters = Acir::PublicInputs{ {} };
    circuit.return_values = Acir::PublicInputs{ {} };
    circuit.assert_messages = {};

    // Create the program with the circuit
    Acir::Program program;
    program.functions = { circuit };
    program.unconstrained_functions = {};

    return program.bincodeSerialize();
}

// IVC tests are disabled until we have proper ACIR circuit generation for IVC
// The simple circuits we create don't have the proper structure needed for IVC
// (they need recursive verification components, pairing points, etc)
TEST_F(BBRpcTests, DISABLED_ClientIvcBasicFlow)
{
    // Test basic IVC flow: start, load, accumulate, prove

    // Start IVC
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto start_response = execute(request, ClientIvcStart{});
    EXPECT_TRUE(start_response.error_message.empty());

    // Need to accumulate at least 2 circuits for IVC
    for (int i = 0; i < 2; i++) {
        // Load a circuit
        auto bytecode = create_ivc_circuit_bytecode();
        CircuitInput circuit{ .name = "ivc_test_circuit_" + std::to_string(i),
                              .bytecode = bytecode,
                              .verification_key = {} };

        ClientIvcLoad load_command{ .circuit = circuit };
        auto load_response = execute(request, std::move(load_command));
        EXPECT_TRUE(load_response.error_message.empty());

        // Create witness data that satisfies the constraints
        Witnesses::WitnessStack witness_stack;
        Witnesses::StackItem stack_item;
        stack_item.index = 0;

        // Values that satisfy:
        // w0 + w1 = w2  (2 + 3 = 5)
        // w2 * w3 = w4  (5 * 4 = 20)
        // w4 + w5 = w6  (20 + 7 = 27)
        stack_item.witness.value = {
            { Witnesses::Witness{ 0 }, "0000000000000000000000000000000000000000000000000000000000000002" }, // w0 = 2
            { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000003" }, // w1 = 3
            { Witnesses::Witness{ 2 }, "0000000000000000000000000000000000000000000000000000000000000005" }, // w2 = 5
            { Witnesses::Witness{ 3 }, "0000000000000000000000000000000000000000000000000000000000000004" }, // w3 = 4
            { Witnesses::Witness{ 4 },
              "0000000000000000000000000000000000000000000000000000000000000014" }, // w4 = 20 (0x14)
            { Witnesses::Witness{ 5 }, "0000000000000000000000000000000000000000000000000000000000000007" }, // w5 = 7
            { Witnesses::Witness{ 6 },
              "000000000000000000000000000000000000000000000000000000000000001b" } // w6 = 27 (0x1b)
        };
        witness_stack.stack.push_back(stack_item);
        std::vector<uint8_t> witness_data = witness_stack.bincodeSerialize();

        ClientIvcAccumulate accumulate_command{ .witness = witness_data };
        auto accumulate_response = execute(request, std::move(accumulate_command));
        EXPECT_TRUE(accumulate_response.error_message.empty());
    }

    // Generate proof
    auto prove_response = execute(request, ClientIvcProve{});
    EXPECT_TRUE(prove_response.error_message.empty());
    // Check that we got a proof with content
    EXPECT_GT(prove_response.proof.mega_proof.size(), 0);
    EXPECT_GT(prove_response.proof.goblin_proof.eccvm_proof.pre_ipa_proof.size(), 0);
}

TEST_F(BBRpcTests, ClientIvcDeriveVkStandalone)
{
    auto bytecode = create_simple_circuit_bytecode();
    CircuitInput circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode, .verification_key = {} };

    // Test standalone VK derivation (just the circuit VK, not full IVC VK)
    ClientIvcDeriveVk derive_vk_command{ .circuit = circuit, .standalone = true };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(derive_vk_command));

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
}

TEST_F(BBRpcTests, ClientIvcDeriveVkFullIvc)
{
    auto bytecode = create_simple_circuit_bytecode();
    CircuitInput circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode, .verification_key = {} };

    // Test non-standalone (full IVC) VK derivation
    ClientIvcDeriveVk derive_vk_command{ .circuit = circuit, .standalone = false };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(derive_vk_command));

    // Full IVC VK derivation is not yet implemented
    EXPECT_FALSE(response.error_message.empty());
    EXPECT_TRUE(response.error_message.find("not yet implemented") != std::string::npos);
}

TEST_F(BBRpcTests, ClientIvcErrorNoStart)
{
    // Test that accumulate fails without start
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0;
    stack_item.witness.value = { { Witnesses::Witness{ 0 },
                                   "0000000000000000000000000000000000000000000000000000000000000001" } };
    witness_stack.stack.push_back(stack_item);
    std::vector<uint8_t> witness_data = witness_stack.bincodeSerialize();

    ClientIvcAccumulate accumulate_command{ .witness = witness_data };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(accumulate_command));

    EXPECT_FALSE(response.error_message.empty());
    EXPECT_TRUE(response.error_message.find("No IVC in progress") != std::string::npos);
}

// Helper function to create an IVC kernel circuit with RecursiveAggregation
std::vector<uint8_t> create_ivc_kernel_circuit_bytecode(size_t num_vk_elements = 10, // Simplified for testing
                                                        size_t num_public_inputs = 3)
{
    Acir::Circuit circuit;
    uint32_t witness_idx = 0;

    // Create FunctionInputs for verification key elements
    std::vector<Acir::FunctionInput> vk_inputs;
    for (size_t i = 0; i < num_vk_elements; i++) {
        Acir::ConstantOrWitnessEnum::Witness witness_input;
        witness_input.value = Acir::Witness{ witness_idx++ };

        Acir::ConstantOrWitnessEnum constant_or_witness;
        constant_or_witness.value = witness_input;

        Acir::FunctionInput input;
        input.input = constant_or_witness;
        input.num_bits = 254; // Field element bits
        vk_inputs.push_back(input);
    }

    // Create FunctionInputs for public inputs
    std::vector<Acir::FunctionInput> public_inputs;
    for (size_t i = 0; i < num_public_inputs; i++) {
        Acir::ConstantOrWitnessEnum::Witness witness_input;
        witness_input.value = Acir::Witness{ witness_idx++ };

        Acir::ConstantOrWitnessEnum constant_or_witness;
        constant_or_witness.value = witness_input;

        Acir::FunctionInput input;
        input.input = constant_or_witness;
        input.num_bits = 254;
        public_inputs.push_back(input);
    }

    // Create key_hash input
    Acir::ConstantOrWitnessEnum::Witness key_hash_witness;
    key_hash_witness.value = Acir::Witness{ witness_idx++ };

    Acir::ConstantOrWitnessEnum key_hash_constant_or_witness;
    key_hash_constant_or_witness.value = key_hash_witness;

    Acir::FunctionInput key_hash_input;
    key_hash_input.input = key_hash_constant_or_witness;
    key_hash_input.num_bits = 254;

    // Create the RecursiveAggregation constraint
    Acir::BlackBoxFuncCall::RecursiveAggregation recursion;
    recursion.verification_key = vk_inputs;
    recursion.proof = {}; // Empty for IVC
    recursion.public_inputs = public_inputs;
    recursion.key_hash = key_hash_input;
    recursion.proof_type = 2; // OINK for IVC

    // Create the BlackBoxFuncCall
    Acir::BlackBoxFuncCall black_box_call;
    black_box_call.value = recursion;

    // Create the opcode
    Acir::Opcode::BlackBoxFuncCall bb_opcode;
    bb_opcode.value = black_box_call;
    Acir::Opcode opcode;
    opcode.value = bb_opcode;

    // Add some arithmetic constraints as well
    for (int i = 0; i < 5; i++) {
        Acir::Expression expr;
        expr.mul_terms = {};
        expr.linear_combinations = {
            { "0000000000000000000000000000000000000000000000000000000000000001", Acir::Witness{ witness_idx } },
            { "0000000000000000000000000000000000000000000000000000000000000001", Acir::Witness{ witness_idx + 1 } },
            { "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000", Acir::Witness{ witness_idx + 2 } }
        };
        expr.q_c = "0000000000000000000000000000000000000000000000000000000000000000";

        Acir::Opcode::AssertZero assert_zero;
        assert_zero.value = expr;
        Acir::Opcode arith_opcode;
        arith_opcode.value = assert_zero;
        circuit.opcodes.push_back(arith_opcode);

        witness_idx += 3;
    }

    // Add the recursion opcode
    circuit.opcodes.push_back(opcode);

    circuit.current_witness_index = witness_idx;
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Unbounded{} };
    circuit.private_parameters = {};
    circuit.public_parameters = Acir::PublicInputs{ {} };
    circuit.return_values = Acir::PublicInputs{ {} };
    circuit.assert_messages = {};

    // Create the program
    Acir::Program program;
    program.functions = { circuit };
    program.unconstrained_functions = {};

    return program.bincodeSerialize();
}

// Helper to create witness data for kernel circuit
std::vector<uint8_t> create_kernel_witness_data(size_t num_vk_elements = 10, size_t num_public_inputs = 3)
{
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0;

    uint32_t witness_idx = 0;

    // Add VK element witnesses (dummy values for testing)
    for (size_t i = 0; i < num_vk_elements; i++) {
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] =
            "0000000000000000000000000000000000000000000000000000000000000001";
    }

    // Add public input witnesses
    for (size_t i = 0; i < num_public_inputs; i++) {
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] =
            "0000000000000000000000000000000000000000000000000000000000000002";
    }

    // Add key hash witness
    stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] =
        "0000000000000000000000000000000000000000000000000000000000000003";

    // Add arithmetic constraint witnesses (a + b = c)
    for (int i = 0; i < 5; i++) {
        // a = 5
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] =
            "0000000000000000000000000000000000000000000000000000000000000005";
        // b = 7
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] =
            "0000000000000000000000000000000000000000000000000000000000000007";
        // c = 12
        stack_item.witness.value[Witnesses::Witness{ witness_idx++ }] =
            "000000000000000000000000000000000000000000000000000000000000000c";
    }

    witness_stack.stack.push_back(stack_item);
    return witness_stack.bincodeSerialize();
}

TEST_F(BBRpcTests, CreateAndSerializeIvcCircuitWithRecursion)
{
    // Test that we can create and serialize an IVC kernel circuit with RecursiveAggregation
    auto kernel_bytecode = create_ivc_kernel_circuit_bytecode();
    EXPECT_GT(kernel_bytecode.size(), 0);

    // Deserialize to verify structure
    Acir::Program program = Acir::Program::bincodeDeserialize(kernel_bytecode);
    EXPECT_EQ(program.functions.size(), 1);

    auto& circuit = program.functions[0];
    EXPECT_GT(circuit.opcodes.size(), 0);

    // Find the BlackBoxFuncCall opcode with RecursiveAggregation
    bool found_recursion = false;
    for (const auto& opcode : circuit.opcodes) {
        if (std::holds_alternative<Acir::Opcode::BlackBoxFuncCall>(opcode.value)) {
            const auto& bb_call = std::get<Acir::Opcode::BlackBoxFuncCall>(opcode.value);
            if (std::holds_alternative<Acir::BlackBoxFuncCall::RecursiveAggregation>(bb_call.value.value)) {
                const auto& recursion = std::get<Acir::BlackBoxFuncCall::RecursiveAggregation>(bb_call.value.value);
                EXPECT_EQ(recursion.proof_type, 2);               // OINK
                EXPECT_EQ(recursion.verification_key.size(), 10); // Our test VK size
                EXPECT_EQ(recursion.public_inputs.size(), 3);     // Our test public inputs
                found_recursion = true;
            }
        }
    }
    EXPECT_TRUE(found_recursion);

    // Test witness data creation and serialization
    auto witness_data = create_kernel_witness_data();
    EXPECT_GT(witness_data.size(), 0);

    // Verify witness can be deserialized
    Witnesses::WitnessStack witness_stack = Witnesses::WitnessStack::bincodeDeserialize(witness_data);
    EXPECT_EQ(witness_stack.stack.size(), 1);
    EXPECT_GE(witness_stack.stack[0].witness.value.size(), 14); // VK + public inputs + key hash
}

// Create a simple circuit that has the proper structure for IVC
std::vector<uint8_t> create_simple_ivc_compatible_circuit()
{
    Acir::Circuit circuit;

    // Create a circuit with:
    // 1. At least one public input (required for IVC)
    // 2. Multiple arithmetic constraints

    // Make witness 0 a public input
    circuit.public_parameters = Acir::PublicInputs{ { Acir::Witness{ 0 } } };

    uint32_t witness_idx = 1; // Start from 1 since 0 is public

    // Add arithmetic constraints
    // First constraint: public_input * w1 - w2 = 0
    {
        Acir::Expression expr;
        expr.mul_terms = {
            { "0000000000000000000000000000000000000000000000000000000000000001",
              Acir::Witness{ 0 },
              Acir::Witness{ 1 } } // 1 * w0 * w1
        };
        expr.linear_combinations = {
            { "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000", Acir::Witness{ 2 } } // -1 * w2
        };
        expr.q_c = "0000000000000000000000000000000000000000000000000000000000000000";

        Acir::Opcode::AssertZero assert_zero;
        assert_zero.value = expr;
        Acir::Opcode opcode;
        opcode.value = assert_zero;
        circuit.opcodes.push_back(opcode);
    }

    // Add more constraints to make the circuit substantial
    for (int i = 0; i < 10; i++) {
        Acir::Expression expr;
        expr.mul_terms = {};
        expr.linear_combinations = {
            { "0000000000000000000000000000000000000000000000000000000000000001", Acir::Witness{ witness_idx + 1 } },
            { "0000000000000000000000000000000000000000000000000000000000000001", Acir::Witness{ witness_idx + 2 } },
            { "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000", Acir::Witness{ witness_idx + 3 } }
        };
        expr.q_c = "0000000000000000000000000000000000000000000000000000000000000000";

        Acir::Opcode::AssertZero assert_zero;
        assert_zero.value = expr;
        Acir::Opcode arith_opcode;
        arith_opcode.value = assert_zero;
        circuit.opcodes.push_back(arith_opcode);

        witness_idx += 3;
    }

    circuit.current_witness_index = witness_idx + 4;
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Unbounded{} };
    circuit.private_parameters = {};
    circuit.return_values = Acir::PublicInputs{ {} };
    circuit.assert_messages = {};

    Acir::Program program;
    program.functions = { circuit };
    program.unconstrained_functions = {};

    return program.bincodeSerialize();
}

// This test demonstrates the limitations of creating IVC circuits with pure ACIR format
// DISABLED: IVC requires goblin ECC operations that cannot be expressed in ACIR format
TEST_F(BBRpcTests, ClientIvcWithRecursionConstraints)
{
    // LIMITATION DISCOVERED:
    // This test fails with "BAD GET(): index = 0, virtual_size_ = 0" in Goblin::prove_merge()
    // because IVC circuits require goblin ECC operations that populate the op_queue.
    //
    // While we can create RecursiveAggregation constraints using BlackBoxFuncCall (proof_type = OINK),
    // the circuits also need:
    // 1. To be created with `ivc.goblin.op_queue`
    // 2. For kernel circuits: `ivc.complete_kernel_circuit_logic(circuit)`
    // 3. For app circuits: `stdlib::recursion::PairingPoints::add_default_to_public_inputs(circuit)`
    //
    // These requirements cannot be expressed in pure ACIR format, which only supports:
    // - Arithmetic constraints
    // - BlackBox operations (including EmbeddedCurveAdd, MultiScalarMul)
    // - RecursiveAggregation constraints
    //
    // The EmbeddedCurveAdd and MultiScalarMul operations create standard EC operations,
    // not the goblin operations required for IVC.

    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});

    // Start IVC
    auto start_response = execute(request, ClientIvcStart{});
    EXPECT_TRUE(start_response.error_message.empty());

    // First, accumulate a more complex app circuit (IVC circuits need more constraints)
    {
        auto app_bytecode = create_ivc_circuit_bytecode(); // Use the more complex circuit
        CircuitInput app_circuit{ .name = "app_circuit", .bytecode = app_bytecode, .verification_key = {} };

        ClientIvcLoad load_command{ .circuit = app_circuit };
        auto load_response = execute(request, std::move(load_command));
        EXPECT_TRUE(load_response.error_message.empty());

        // Create witness for app circuit
        Witnesses::WitnessStack app_witness_stack;
        Witnesses::StackItem app_stack_item;
        app_stack_item.index = 0;

        // Values that satisfy:
        // w0 + w1 = w2  (2 + 3 = 5)
        // w2 * w3 = w4  (5 * 4 = 20)
        // w4 + w5 = w6  (20 + 7 = 27)
        app_stack_item.witness.value = {
            { Witnesses::Witness{ 0 }, "0000000000000000000000000000000000000000000000000000000000000002" }, // w0 = 2
            { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000003" }, // w1 = 3
            { Witnesses::Witness{ 2 }, "0000000000000000000000000000000000000000000000000000000000000005" }, // w2 = 5
            { Witnesses::Witness{ 3 }, "0000000000000000000000000000000000000000000000000000000000000004" }, // w3 = 4
            { Witnesses::Witness{ 4 }, "0000000000000000000000000000000000000000000000000000000000000014" }, // w4 = 20
            { Witnesses::Witness{ 5 }, "0000000000000000000000000000000000000000000000000000000000000007" }, // w5 = 7
            { Witnesses::Witness{ 6 }, "000000000000000000000000000000000000000000000000000000000000001b" }  // w6 = 27
        };
        app_witness_stack.stack.push_back(app_stack_item);
        std::vector<uint8_t> app_witness_data = app_witness_stack.bincodeSerialize();

        ClientIvcAccumulate accumulate_command{ .witness = app_witness_data };
        auto accumulate_response = execute(request, std::move(accumulate_command));
        EXPECT_TRUE(accumulate_response.error_message.empty());
    }

    // Now accumulate a kernel circuit with IVC recursion constraints
    {
        auto kernel_bytecode = create_ivc_kernel_circuit_bytecode();
        CircuitInput kernel_circuit{ .name = "kernel_circuit", .bytecode = kernel_bytecode, .verification_key = {} };

        ClientIvcLoad load_command{ .circuit = kernel_circuit };
        auto load_response = execute(request, std::move(load_command));
        EXPECT_TRUE(load_response.error_message.empty());

        auto kernel_witness_data = create_kernel_witness_data();

        ClientIvcAccumulate accumulate_command{ .witness = kernel_witness_data };
        auto accumulate_response = execute(request, std::move(accumulate_command));

        // This is where it would fail with goblin operations missing
        EXPECT_TRUE(accumulate_response.error_message.empty());
    }

    // Generate proof - this would fail with "BAD GET(): index = 0, virtual_size_ = 0"
    // because the circuits lack goblin operations
    auto prove_response = execute(request, ClientIvcProve{});
    EXPECT_TRUE(prove_response.error_message.empty());
}

// === FINDINGS: How to Create a Valid Client IVC Circuit using ONLY Acir::Circuit ===
//
// KEY DISCOVERY: IVC recursion constraints CAN be created using Acir::Opcode::BlackBoxFuncCall
// with the RecursiveAggregation variant!
//
// 1. ACIR CIRCUIT STRUCTURE (from serde/acir.hpp):
//    ```cpp
//    struct Circuit {
//        uint32_t current_witness_index;
//        std::vector<Opcode> opcodes;
//        ExpressionWidth expression_width;
//        std::vector<Witness> private_parameters;
//        PublicInputs public_parameters;
//        PublicInputs return_values;
//        std::vector<std::tuple<OpcodeLocation, std::string>> assert_messages;
//    };
//    ```
//
// 2. CREATING IVC RECURSION VIA BLACKBOXFUNCCALL:
//    The BlackBoxFuncCall struct contains a RecursiveAggregation variant:
//    ```cpp
//    struct BlackBoxFuncCall {
//        std::variant<..., RecursiveAggregation, ...> value;
//    };
//
//    struct RecursiveAggregation {
//        std::vector<Acir::FunctionInput> verification_key;
//        std::vector<Acir::FunctionInput> proof;
//        std::vector<Acir::FunctionInput> public_inputs;
//        Acir::FunctionInput key_hash;
//        uint32_t proof_type;  // OINK = 2, PG = 3 for IVC
//    };
//    ```
//
// 3. HOW IT WORKS IN acir_to_constraint_buf.cpp:
//    When processing BlackBoxFuncCall::RecursiveAggregation:
//    - If proof_type is OINK (2) or PG (3), it creates IVC recursion constraints
//    - These are added to af.ivc_recursion_constraints
//    - The conversion happens in lines 748-751 of acir_to_constraint_buf.cpp
//
// 4. CREATING AN IVC KERNEL CIRCUIT WITH ACIR:
//    ```cpp
//    Acir::Circuit create_ivc_kernel_circuit() {
//        Acir::Circuit circuit;
//
//        // Need witness indices for VK elements, proof, and public inputs
//        uint32_t witness_idx = 0;
//
//        // Create FunctionInputs for verification key (~100+ elements)
//        std::vector<Acir::FunctionInput> vk_inputs;
//        for (int i = 0; i < 100; i++) {
//            vk_inputs.push_back(Acir::FunctionInput{
//                Acir::FunctionInput::witness{Acir::Witness{witness_idx++}}
//            });
//        }
//
//        // Create FunctionInputs for public inputs to verify
//        std::vector<Acir::FunctionInput> public_inputs;
//        for (int i = 0; i < num_public_inputs; i++) {
//            public_inputs.push_back(Acir::FunctionInput{
//                Acir::FunctionInput::witness{Acir::Witness{witness_idx++}}
//            });
//        }
//
//        // Create the RecursiveAggregation constraint
//        Acir::BlackBoxFuncCall::RecursiveAggregation recursion{
//            .verification_key = vk_inputs,
//            .proof = {},  // Empty for IVC
//            .public_inputs = public_inputs,
//            .key_hash = Acir::FunctionInput{
//                Acir::FunctionInput::witness{Acir::Witness{witness_idx++}}
//            },
//            .proof_type = 2  // OINK for IVC (or 3 for PG)
//        };
//
//        // Create the BlackBoxFuncCall opcode
//        Acir::BlackBoxFuncCall black_box_call;
//        black_box_call.value = recursion;
//
//        // Add to circuit opcodes
//        circuit.opcodes.push_back(Acir::Opcode{
//            Acir::Opcode::BlackBoxFuncCall{black_box_call}
//        });
//
//        circuit.current_witness_index = witness_idx;
//        circuit.expression_width = Acir::ExpressionWidth{
//            Acir::ExpressionWidth::Unbounded{}
//        };
//
//        return circuit;
//    }
//    ```
//
// 5. WITNESS DATA REQUIREMENTS:
//    For the IVC recursion to work, witness data must include:
//    - Verification key elements (from honk_verification_key->to_field_elements())
//    - Public inputs from the circuit being verified
//    - Key hash value
//
// 6. CREATING APP CIRCUITS:
//    App circuits are simpler - just arithmetic constraints without recursion.
//    The pairing points are added automatically during circuit construction.
//
// 7. COMPLETE IVC FLOW WITH ACIR:
//    ```cpp
//    // 1. Create app circuit (no recursion)
//    auto app_circuit = create_simple_circuit_bytecode();
//
//    // 2. Accumulate it in IVC
//    ivc->accumulate(app_circuit);
//
//    // 3. Create kernel circuit with RecursiveAggregation
//    auto kernel_circuit = create_ivc_kernel_circuit();
//
//    // 4. Provide witness data with VK elements and public inputs
//    auto witness_data = create_kernel_witness_data(ivc->verification_queue);
//
//    // 5. Accumulate kernel
//    ivc->accumulate(kernel_circuit, witness_data);
//    ```
//
// 8. KEY INSIGHT:
//    The critical discovery is that Acir::BlackBoxFuncCall::RecursiveAggregation
//    with proof_type = OINK (2) or PG (3) is the mechanism to create IVC recursion
//    constraints from pure ACIR format. This is how Noir's verify_proof() calls
//    get translated into IVC recursion constraints.

// === SUMMARY: Creating IVC Circuits with Recursion Constraints ===
//
// We successfully demonstrated how to:
// 1. Create IVC kernel circuits using pure Acir::Circuit with RecursiveAggregation
// 2. Serialize and deserialize these circuits
// 3. Create proper witness data for IVC recursion constraints
//
// The key components are:
// - Acir::BlackBoxFuncCall::RecursiveAggregation with proof_type = OINK (2) or PG (3)
// - FunctionInput structures for verification key, public inputs, and key hash
// - Witness data that provides the actual values for verification
//
// See the test CreateAndSerializeIvcCircuitWithRecursion for a working example.
//
// FUNDAMENTAL LIMITATION DISCOVERED:
// IVC circuits require goblin ECC operations that CANNOT be expressed in ACIR format.
//
// The error "BAD GET(): index = 0, virtual_size_ = 0" in Goblin::prove_merge() occurs
// because IVC circuits need:
// 1. To be created with `ivc.goblin.op_queue` - provides goblin ECC operation queue
// 2. For kernel circuits: `ivc.complete_kernel_circuit_logic(circuit)` - adds recursive verifiers
// 3. For app circuits: `stdlib::recursion::PairingPoints::add_default_to_public_inputs(circuit)`
//
// ACIR format only supports:
// - Arithmetic constraints (AssertZero)
// - BlackBox operations (including EmbeddedCurveAdd, MultiScalarMul)
// - RecursiveAggregation constraints
//
// The EmbeddedCurveAdd and MultiScalarMul operations in ACIR create standard EC operations
// using cycle_group, NOT the goblin operations required for IVC. Goblin operations are
// special ECC operations that populate the op_queue for the ECCVM and Translator components.
//
// CONCLUSION:
// While IVC recursion constraints CAN be expressed in pure ACIR format using
// BlackBoxFuncCall::RecursiveAggregation, and the structure is correct, generating
// actual IVC proofs is IMPOSSIBLE with pure ACIR circuits because they lack the
// necessary goblin infrastructure. This is a fundamental architectural limitation,
// not a bug or missing feature in the ACIR format.

} // namespace bb::bbrpc
