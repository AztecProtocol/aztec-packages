#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "bbrpc_execute.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <cstddef>
#include <gtest/gtest.h>
#include <sstream>

namespace bb::bbrpc {

using namespace acir_bincode_test;

BBRpcRequest create_test_bbrpc_request()
{
    return { .trace_settings = TraceSettings{ SMALL_TEST_STRUCTURE } };
}

class BBRpcTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(BBRpcTests, CircuitComputeVkDirect)
{
    // Create a minimal circuit
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();
    CircuitInputNoVK circuit{
        .name = "test_circuit",
        .bytecode = bytecode,
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Create a minimal request context
    BBRpcRequest request = create_test_bbrpc_request();

    // Call execute directly
    auto response = execute(request, CircuitComputeVk{ circuit, settings });

    // Check that the command succeeded
    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
}

TEST_F(BBRpcTests, ProveAndVerifyCircuit)
{
    // Create a minimal circuit
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    // First derive the verification key
    CircuitInputNoVK circuit_for_vk{ .name = "test_circuit", .bytecode = bytecode };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Derive VK
    BBRpcRequest request = create_test_bbrpc_request();
    auto vk_response = execute(request, CircuitComputeVk{ circuit_for_vk, settings });

    EXPECT_TRUE(vk_response.error_message.empty());
    EXPECT_FALSE(vk_response.verification_key.empty());

    // Now create a proof with witness data (already created above)

    CircuitInput circuit_for_proof{ .name = "test_circuit",
                                    .bytecode = bytecode,
                                    .verification_key = vk_response.verification_key };

    auto prove_response = execute(request, CircuitProve{ circuit_for_proof, witness_data, settings });

    EXPECT_TRUE(prove_response.error_message.empty());
    EXPECT_FALSE(prove_response.proof.empty());

    // Finally, verify the proof
    CircuitVerify verify_command{ .verification_key = vk_response.verification_key,
                                  .public_inputs = prove_response.public_inputs,
                                  .proof = prove_response.proof,
                                  .settings = settings };
    BBRpcRequest verify_request = create_test_bbrpc_request();
    auto verify_response = execute(verify_request, std::move(verify_command));

    EXPECT_TRUE(verify_response.error_message.empty());
    EXPECT_TRUE(verify_response.verified);
}

TEST_F(BBRpcTests, CircuitInfo)
{
    // Create a minimal circuit
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    CircuitInput circuit{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Not needed for info
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    // Get circuit info
    BBRpcRequest request = create_test_bbrpc_request();
    auto response = execute(request, CircuitInfo{ circuit, false, settings });

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_GT(response.total_gates, 0);
    EXPECT_GT(response.subgroup_size, 0);
    // Subgroup size should be a power of 2
    EXPECT_EQ(response.subgroup_size & (response.subgroup_size - 1), 0);
}

TEST_F(BBRpcTests, CircuitCheckValid)
{
    // Create a minimal circuit with valid witness data
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    CircuitInput circuit{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Not needed for check
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    BBRpcRequest request = create_test_bbrpc_request();
    auto response = execute(request, CircuitCheck{ circuit, witness_data, settings });

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_TRUE(response.satisfied);
}

TEST_F(BBRpcTests, CircuitCheckInvalid)
{
    // Create a minimal circuit
    auto [bytecode, valid_witness_data] = create_simple_circuit_bytecode();

    // Create invalid witness data (5 * 7 != 13)
    std::vector<uint8_t> witness_data = create_invalid_witness_data();

    CircuitInput circuit{
        .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Not needed for check
    };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    CircuitCheck check_command{ .circuit = circuit, .witness = witness_data, .settings = settings };
    BBRpcRequest request = create_test_bbrpc_request();
    auto response = execute(request, std::move(check_command));

    EXPECT_FALSE(response.error_message.empty());
    EXPECT_FALSE(response.satisfied);
}

TEST_F(BBRpcTests, ProofAsFields)
{
    // Create a simple proof (just some field elements)
    HonkProof proof = { bb::fr(1), bb::fr(2), bb::fr(3), bb::fr(4) };

    ProofAsFields command{ .proof = proof };
    BBRpcRequest request = create_test_bbrpc_request();
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
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();
    CircuitInputNoVK circuit{ .name = "test_circuit", .bytecode = bytecode };

    ProofSystemSettings settings{ .ipa_accumulation = false,
                                  .oracle_hash_type = "poseidon2",
                                  .disable_zk = true,
                                  .honk_recursion = 0,
                                  .recursive = false };

    BBRpcRequest vk_request = create_test_bbrpc_request();
    auto vk_response = execute(vk_request, CircuitComputeVk{ circuit, settings });

    EXPECT_TRUE(vk_response.error_message.empty());

    // Now convert VK to fields
    BBRpcRequest fields_request = create_test_bbrpc_request();
    auto fields_response = execute(fields_request, VkAsFields{ vk_response.verification_key, false });

    EXPECT_TRUE(fields_response.error_message.empty());
    EXPECT_GT(fields_response.fields.size(), 0);
}

// Test IVC with mock kernels enabled
// NOTE: we could consider using a more complex circuit with multiple kernels, but for now
// we just test the basic functionality with a single kernel. This is enough to exercise the code path.
TEST_F(BBRpcTests, ClientIvcWithMockKernels)
{
    // Create request with testing_only_generate_mock_kernels enabled
    BBRpcRequest request = create_test_bbrpc_request();

    // Start IVC
    auto start_response = execute(request, ClientIvcStart{});
    EXPECT_TRUE(start_response.error_message.empty());

    // Get our minimal circuit and witness
    auto [circuit_bytecode, witness_data] = create_simple_circuit_bytecode();
    auto app_vk_result =
        execute(request, ClientIvcComputeVk{ CircuitInputNoVK{ "ivc_vk_circuit", circuit_bytecode }, true });
    const MegaFlavor::VerificationKey& app_vk =
        from_buffer<MegaFlavor::VerificationKey>(app_vk_result.verification_key);
    auto app_vk_fields = app_vk.to_field_elements();
    // Load the circuit
    execute(request, ClientIvcLoad{ CircuitInput{ "app_circuit", circuit_bytecode, {} } });
    execute(request, ClientIvcAccumulate{ witness_data });

    auto init_kernel_bytecode = create_simple_kernel(app_vk_fields.size(), false);
    auto init_kernel_witness_data = create_kernel_witness(app_vk_fields);
    execute(request, ClientIvcLoad{ CircuitInput{ "kernel_circuit", init_kernel_bytecode, {} } });
    execute(request, ClientIvcAccumulate{ init_kernel_witness_data });

    // Generate proof
    auto prove_response = execute(request, ClientIvcProve{});
    EXPECT_TRUE(prove_response.error_message.empty());
}

TEST_F(BBRpcTests, ClientIvcComputeVkStandalone)
{
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();
    CircuitInputNoVK circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode };

    // Test standalone VK derivation (just the circuit VK, not full IVC VK)
    BBRpcRequest request = create_test_bbrpc_request();
    auto response = execute(request, ClientIvcComputeVk{ .circuit = circuit, .standalone = true });

    EXPECT_TRUE(response.error_message.empty());
    EXPECT_FALSE(response.verification_key.empty());
}

TEST_F(BBRpcTests, ClientIvcComputeVkFullIvc)
{
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();
    CircuitInputNoVK circuit{ .name = "ivc_vk_circuit", .bytecode = bytecode };

    // Test non-standalone (full IVC) VK derivation
    BBRpcRequest request = create_test_bbrpc_request();
    auto response = execute(request, ClientIvcComputeVk{ circuit, false });

    // Full IVC VK derivation is now implemented
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
    BBRpcRequest request = create_test_bbrpc_request();
    auto response = execute(request, std::move(accumulate_command));

    EXPECT_FALSE(response.error_message.empty());
    EXPECT_TRUE(response.error_message.find("No IVC in progress") != std::string::npos);
}

// Test for ClientIvcCheckPrecomputedVk (singular)
TEST_F(BBRpcTests, ClientIvcCheckPrecomputedVk)
{
    auto request = create_test_bbrpc_request();

    // Create a simple circuit
    auto [bytecode, witness] = create_simple_circuit_bytecode();

    // First derive the VK for our test circuit
    ClientIvcComputeVk derive_cmd{ .circuit = CircuitInputNoVK{ .name = "test_circuit", .bytecode = bytecode },
                                   .standalone = true };

    auto derive_response = execute(request, std::move(derive_cmd));
    ASSERT_TRUE(derive_response.error_message.empty());
    ASSERT_FALSE(derive_response.verification_key.empty());

    // Test 1: Valid VK should match
    {
        ClientIvcCheckPrecomputedVk check_cmd{ .circuit =
                                                   CircuitInput{ .name = "test_circuit",
                                                                 .bytecode = bytecode,
                                                                 .verification_key = derive_response.verification_key },
                                               .function_name = "test_function" };

        auto response = execute(request, std::move(check_cmd));
        EXPECT_TRUE(response.error_message.empty());
        EXPECT_TRUE(response.valid);
    }

    // Test 2: Modified VK should not match
    {
        auto bad_vk = derive_response.verification_key;
        bad_vk[0] ^= 1; // Flip one bit

        ClientIvcCheckPrecomputedVk check_cmd{
            .circuit = CircuitInput{ .name = "test_circuit", .bytecode = bytecode, .verification_key = bad_vk },
            .function_name = "test_function"
        };

        auto response = execute(request, std::move(check_cmd));
        EXPECT_FALSE(response.error_message.empty());
        EXPECT_FALSE(response.valid);
        EXPECT_TRUE(response.error_message.find("does not match") != std::string::npos);
    }

    // Test 3: Missing VK
    {
        ClientIvcCheckPrecomputedVk check_cmd{
            .circuit =
                CircuitInput{
                    .name = "test_circuit", .bytecode = bytecode, .verification_key = {} // Empty VK
                },
            .function_name = "test_function"
        };

        auto response = execute(request, std::move(check_cmd));
        EXPECT_FALSE(response.error_message.empty());
        EXPECT_FALSE(response.valid);
        EXPECT_TRUE(response.error_message.find("No precomputed VK provided") != std::string::npos);
    }

    // Test 4: Demonstrate batch checking pattern
    {
        // In a real batch scenario, you would call the command multiple times
        std::vector<std::string> function_names = { "func1", "func2", "func3" };
        std::vector<bool> results;

        // Check func1 with good VK
        ClientIvcCheckPrecomputedVk check1{ .circuit =
                                                CircuitInput{ .name = "circuit1",
                                                              .bytecode = bytecode,
                                                              .verification_key = derive_response.verification_key },
                                            .function_name = function_names[0] };
        auto response1 = execute(request, std::move(check1));
        results.push_back(response1.valid);

        // Check func2 with bad VK
        auto bad_vk = derive_response.verification_key;
        bad_vk[0] ^= 1;
        ClientIvcCheckPrecomputedVk check2{
            .circuit = CircuitInput{ .name = "circuit2", .bytecode = bytecode, .verification_key = bad_vk },
            .function_name = function_names[1]
        };
        auto response2 = execute(request, std::move(check2));
        results.push_back(response2.valid);

        // Check func3 with missing VK
        ClientIvcCheckPrecomputedVk check3{
            .circuit = CircuitInput{ .name = "circuit3", .bytecode = bytecode, .verification_key = {} },
            .function_name = function_names[2]
        };
        auto response3 = execute(request, std::move(check3));
        results.push_back(response3.valid);

        // Verify batch results
        EXPECT_TRUE(results[0]);  // func1 should be valid
        EXPECT_FALSE(results[1]); // func2 should be invalid
        EXPECT_FALSE(results[2]); // func3 should be invalid
    }
}

} // namespace bb::bbrpc
