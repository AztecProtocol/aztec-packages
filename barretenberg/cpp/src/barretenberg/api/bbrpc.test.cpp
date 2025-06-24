#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "bbrpc_execute.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <cstddef>
#include <gtest/gtest.h>
#include <sstream>

namespace bb::bbrpc {

BBRpcRequest create_test_bbrpc_request()
{
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    request.trace_settings = TraceSettings{ SMALL_TEST_STRUCTURE }; // Minimal test structure
    return request;
}

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
    // Create the program with the circuit
    Acir::Program program;
    program.functions = { circuit };

    // Serialize the program using bincode
    return program.bincodeSerialize();
}

std::vector<uint8_t> create_simple_kernel(size_t vk_size)
{
    Acir::Circuit circuit;

    // Need witness indices for VK elements, proof, and public inputs
    uint32_t witness_idx = 0;

    circuit.public_parameters = Acir::PublicInputs{ {} }; // No public inputs
    std::vector<Acir::FunctionInput> vk_inputs;
    for (uint32_t i = 0; i < vk_size; i++) {
        auto pub_input = Acir::Witness{ witness_idx };
        circuit.public_parameters.value.push_back({ pub_input });
        Acir::FunctionInput input{ { Acir::ConstantOrWitnessEnum::Witness{ pub_input } }, 128 };
        vk_inputs.push_back(input);
        witness_idx++;
    }

    // Modeled after noir-projects/mock-protocol-circuits/crates/mock-private-kernel-init/src/main.nr
    // We only have something like the init kernel, so verify OINK. pass no proof or public inputs like there.
    Acir::BlackBoxFuncCall::RecursiveAggregation recursion{
        .verification_key = vk_inputs,
        .proof = {},
        .public_inputs = {},
        // unused
        .key_hash = Acir::FunctionInput{ { Acir::ConstantOrWitnessEnum::Witness{ Acir::Witness{ 0 } } }, 128 },
        .proof_type = acir_format::PROOF_TYPE::OINK
    };
    recursion.bincodeDeserialize(recursion.bincodeSerialize());

    // Create the BlackBoxFuncCall opcode
    Acir::BlackBoxFuncCall black_box_call;
    black_box_call.value = recursion;
    black_box_call.bincodeDeserialize(black_box_call.bincodeSerialize());

    // Add to circuit opcodes
    circuit.opcodes.push_back(Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ black_box_call } });
    circuit.current_witness_index = witness_idx;
    circuit.expression_width = Acir::ExpressionWidth{ Acir::ExpressionWidth::Bounded{ 3 } };

    // Create the program with the circuit
    Acir::Program program;
    program.functions = { circuit };

    program.bincodeDeserialize(program.bincodeSerialize());
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
    CircuitInputNoVK circuit{
        .name = "test_circuit",
        .bytecode = create_simple_circuit_bytecode(),
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Create a minimal request context
    BBRpcRequest request = create_test_bbrpc_request();

    // Call execute directly
    auto response = execute(request, CircuitDeriveVk{ circuit, settings });

    // Check that the command succeeded
    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
}

TEST_F(BBRpcTests, ProveAndVerifyCircuit)
{
    // Create a minimal circuit
    auto bytecode = create_simple_circuit_bytecode();

    // First derive the verification key
    CircuitInputNoVK circuit_for_vk{ .name = "test_circuit", .bytecode = bytecode };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Derive VK
    // TODO(AI): make all std::move'd constructors like this just use a constructor on the std::move line - construct
    // with positional arguments for brevity
    CircuitDeriveVk derive_vk_command{ .circuit = circuit_for_vk, .settings = settings };
    BBRpcRequest request = create_test_bbrpc_request();
    auto vk_response = execute(request, std::move(derive_vk_command));

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

    // TODO(AI) simplify as above
    CircuitProve prove_command{ .circuit = circuit_for_proof, .witness = witness_data, .settings = settings };
    auto prove_response = execute(request, std::move(prove_command));

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
    // TODO(AI) simplify as above
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

    // TODO(AI) simplify as above
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
    CircuitInputNoVK circuit{ .name = "test_circuit", .bytecode = bytecode };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    BBRpcRequest vk_request(RequestId{ 1 }, std::vector<Command>{});
    auto vk_response = execute(vk_request, CircuitDeriveVk{ circuit, settings });

    EXPECT_TRUE(vk_response.error_message.empty());

    // Now convert VK to fields
    BBRpcRequest fields_request(RequestId{ 2 }, std::vector<Command>{});
    auto fields_response = execute(fields_request, VkAsFields{ vk_response.verification_key, false });

    EXPECT_TRUE(fields_response.error_message.empty());
    EXPECT_GT(fields_response.fields.size(), 0);
}

// Helper to create a minimal circuit suitable for IVC testing
// Returns a pair of (circuit_bytecode, witness_data)
// TODO(AI) deduplicate this so there is only ONE app circuit construction
std::pair<std::vector<uint8_t>, std::vector<uint8_t>> create_minimal_ivc_circuit()
{
    // Create a simple circuit with public inputs (required for IVC)
    // Constraint: public_input * w1 = w2
    Acir::Circuit circuit;

    // Make witness 0 a public input
    circuit.public_parameters = Acir::PublicInputs{ { Acir::Witness{ 0 } } };

    std::string one = "0000000000000000000000000000000000000000000000000000000000000001";
    std::string minus_one = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000";

    // Create constraint: w0 * w1 - w2 = 0
    Acir::Expression expr;
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

    // Create witness data: public_input=2, w1=3, w2=6 (so 2*3=6)
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item{};
    stack_item.witness.value = {
        { Witnesses::Witness{ 0 },
          "0000000000000000000000000000000000000000000000000000000000000002" }, // public_input = 2
        { Witnesses::Witness{ 1 }, "0000000000000000000000000000000000000000000000000000000000000003" }, // w1 = 3
        { Witnesses::Witness{ 2 }, "0000000000000000000000000000000000000000000000000000000000000006" }  // w2 = 6
    };
    witness_stack.stack.push_back(stack_item);

    return { program.bincodeSerialize(), witness_stack.bincodeSerialize() };
}

// Test IVC with mock kernels enabled
TEST_F(BBRpcTests, ClientIvcWithMockKernels)
{
    // Create request with testing_only_generate_mock_kernels enabled
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});

    // Start IVC
    auto start_response = execute(request, ClientIvcStart{});
    EXPECT_TRUE(start_response.error_message.empty());

    // Get our minimal circuit and witness
    auto [circuit_bytecode, witness_data] = create_minimal_ivc_circuit();
    auto vk_result =
        execute(request, ClientIvcDeriveVk{ CircuitInputNoVK{ "ivc_vk_circuit", circuit_bytecode }, true });
    const MegaFlavor::VerificationKey& app_vk = from_buffer<MegaFlavor::VerificationKey>(vk_result.verification_key);
    auto vk_as_fields = app_vk.to_field_elements();
    auto kernel_bytecode = create_simple_kernel(vk_as_fields.size());

    Witnesses::WitnessStack kernel_witness;
    Witnesses::StackItem stack_item{};
    for (uint32_t i = 0; i < vk_as_fields.size(); i++) {
        std::stringstream ss;
        ss << vk_as_fields[i];
        stack_item.witness.value[Witnesses::Witness{ i }] = ss.str();
    }
    kernel_witness.stack.push_back(stack_item);

    // Load the circuit
    execute(request, ClientIvcLoad{ CircuitInput{ "app_circuit", circuit_bytecode, {} } });
    execute(request, ClientIvcAccumulate{ witness_data });
    execute(request, ClientIvcLoad{ CircuitInput{ "kernel_circuit", kernel_bytecode, {} } });
    execute(request, ClientIvcAccumulate{ kernel_witness.bincodeSerialize() });

    // Generate proof
    auto prove_response = execute(request, ClientIvcProve{});
    EXPECT_TRUE(prove_response.error_message.empty());
    EXPECT_GT(prove_response.proof.mega_proof.size(), 0);
    EXPECT_GT(prove_response.proof.goblin_proof.eccvm_proof.pre_ipa_proof.size(), 0);
}

TEST_F(BBRpcTests, ClientIvcDeriveVkStandalone)
{
    auto bytecode = create_simple_circuit_bytecode();
    CircuitInputNoVK circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode };

    // Test standalone VK derivation (just the circuit VK, not full IVC VK)
    BBRpcRequest request(RequestId{ 1 }, std::vector<Command>{});
    auto response = execute(request, ClientIvcDeriveVk{ .circuit = circuit, .standalone = true });

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
}

TEST_F(BBRpcTests, ClientIvcDeriveVkFullIvc)
{
    auto bytecode = create_simple_circuit_bytecode();
    CircuitInputNoVK circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode };

    // Test non-standalone (full IVC) VK derivation
    // TODO(AI) simplify
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

} // namespace bb::bbrpc
