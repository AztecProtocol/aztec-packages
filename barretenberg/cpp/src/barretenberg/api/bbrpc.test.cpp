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

// TODO: Fix IVC tests - they require more complex circuits with recursive verification
// TEST_F(BBRpcTests, ClientIvcBasicFlow)
// {
//     // Test basic IVC flow: start, load, accumulate, prove

//     // Start IVC
//     ClientIvcStart start_command{};
//     BBRpcRequest start_request(RequestId{ 1 }, std::vector<Command>{});
//     auto start_response = execute(start_request, std::move(start_command));
//     EXPECT_TRUE(start_response.error_message.empty());

//     // Load a circuit
//     auto bytecode = create_simple_circuit_bytecode();
//     CircuitInput circuit{
//         .name = "ivc_test_circuit",
//         .bytecode = bytecode,
//         .verification_key = {}
//     };

//     ClientIvcLoad load_command{ .circuit = circuit };
//     auto load_response = execute(start_request, std::move(load_command));
//     EXPECT_TRUE(load_response.error_message.empty());

//     // Accumulate with witness
//     Witnesses::WitnessStack witness_stack;
//     Witnesses::StackItem stack_item;
//     stack_item.index = 0;
//     stack_item.witness.value = {
//         {Witnesses::Witness{0}, "0000000000000000000000000000000000000000000000000000000000000003"}, // w0 = 3
//         {Witnesses::Witness{1}, "0000000000000000000000000000000000000000000000000000000000000004"}, // w1 = 4
//         {Witnesses::Witness{2}, "0000000000000000000000000000000000000000000000000000000000000007"}  // w2 = 7
//     };
//     witness_stack.stack.push_back(stack_item);
//     std::vector<uint8_t> witness_data = witness_stack.bincodeSerialize();

//     ClientIvcAccumulate accumulate_command{ .witness = witness_data };
//     auto accumulate_response = execute(start_request, std::move(accumulate_command));
//     EXPECT_TRUE(accumulate_response.error_message.empty());

//     // Generate proof
//     ClientIvcProve prove_command{};
//     auto prove_response = execute(start_request, std::move(prove_command));
//     EXPECT_TRUE(prove_response.error_message.empty());
//     // Check that we got a proof with content
//     EXPECT_GT(prove_response.proof.size(), 0);
// }

TEST_F(BBRpcTests, ClientIvcDeriveVk)
{
    auto bytecode = create_simple_circuit_bytecode();
    CircuitInput circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode, .verification_key = {} };

    // Test non-standalone VK derivation
    ClientIvcDeriveVk derive_vk_command{ .circuit = circuit, .standalone = false };
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, std::move(derive_vk_command));

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
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

} // namespace bb::bbrpc
