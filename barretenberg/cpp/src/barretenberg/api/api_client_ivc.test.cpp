#include "api_client_ivc.hpp"
#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/api/bbrpc_execute.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <chrono>
#include <cstddef>
#include <filesystem>
#include <gtest/gtest.h>
#include <sstream>

namespace bb {

using namespace acir_bincode_test;

// Helper to create a temporary directory for test files
std::filesystem::path create_temp_test_dir()
{
    std::filesystem::path temp_dir = "tmp_api_client_ivc_test";
    temp_dir /= std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
    std::filesystem::create_directories(temp_dir);
    return temp_dir;
}

// Helper to create PrivateExecutionSteps for testing
void create_test_private_execution_steps(const std::filesystem::path& output_path)
{
    using namespace acir_format;

    // First create a simple app circuit
    auto [app_bytecode, app_witness_data] = create_simple_circuit_bytecode();

    // Get the VK for the app circuit
    bbrpc::BBRpcRequest request;
    request.trace_settings = TraceSettings{ AZTEC_TRACE_STRUCTURE };

    auto app_vk =
        bbrpc::execute(request,
                       bbrpc::ClientIvcComputeVk{ .circuit = { .name = "app_circuit", .bytecode = app_bytecode },
                                                  .standalone = true })
            .verification_key;
    auto app_vk_fields = from_buffer<MegaFlavor::VerificationKey>(app_vk).to_field_elements();

    // Now create a kernel circuit that verifies the app circuit
    auto kernel_bytecode = create_simple_kernel(app_vk_fields.size(), false);
    auto kernel_witness_data = create_kernel_witness(app_vk_fields);

    auto kernel_vk =
        bbrpc::execute(request,
                       bbrpc::ClientIvcComputeVk{ .circuit = { .name = "kernel_circuit", .bytecode = kernel_bytecode },
                                                  .standalone = true })
            .verification_key;

    // Create PrivateExecutionStepRaw for the kernel
    std::vector<PrivateExecutionStepRaw> raw_steps;
    raw_steps.push_back(
        { .bytecode = app_bytecode, .witness = app_witness_data, .vk = app_vk, .function_name = "app_function" });
    raw_steps.push_back({ .bytecode = kernel_bytecode,
                          .witness = kernel_witness_data,
                          .vk = kernel_vk,
                          .function_name = "kernel_function" });
    PrivateExecutionStepRaw::compress_and_save(std::move(raw_steps), output_path);
}

class ClientIVCAPITests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    void SetUp() override { test_dir = create_temp_test_dir(); }

    void TearDown() override
    {
        if (std::filesystem::exists(test_dir)) {
            std::filesystem::remove_all(test_dir);
        }
    }

    std::filesystem::path test_dir;
};

std::vector<uint8_t> compress(const std::vector<uint8_t>& input);

// Helper lambda to create standalone VK for comparison
ClientIVC::MegaVerificationKey get_ivc_vk(const std::filesystem::path& test_dir)
{
    auto [app_bytecode, app_witness_data] = create_simple_circuit_bytecode();
    bbrpc::BBRpcRequest request;
    auto app_vk =
        bbrpc::execute(request,
                       bbrpc::ClientIvcComputeVk{ .circuit = { .name = "app_circuit", .bytecode = app_bytecode },
                                                  .standalone = true })
            .verification_key;
    auto app_vk_fields = from_buffer<MegaFlavor::VerificationKey>(app_vk).to_field_elements();
    auto bytecode = create_simple_kernel(app_vk_fields.size(), true);
    std::filesystem::path bytecode_path = test_dir / "circuit.acir";
    write_file(bytecode_path, compress(bytecode));

    ClientIVCAPI::Flags write_vk_flags;
    write_vk_flags.verifier_type = "ivc";
    write_vk_flags.output_format = "bytes";

    ClientIVCAPI api;
    api.write_vk(write_vk_flags, bytecode_path, test_dir);

    return from_buffer<ClientIVC::MegaVerificationKey>(read_file(test_dir / "vk"));
};

TEST_F(ClientIVCAPITests, ProveAndVerifyFileBasedFlow)
{
    auto ivc_vk = get_ivc_vk(test_dir);

    // Create test input file
    std::filesystem::path input_path = test_dir / "input.msgpack";
    create_test_private_execution_steps(input_path);

    std::filesystem::path output_dir = test_dir / "output";
    std::filesystem::create_directories(output_dir);

    // Helper lambda to create proof and VK files
    auto create_proof_and_vk = [&]() {
        ClientIVCAPI::Flags flags;
        flags.write_vk = true;

        ClientIVCAPI api;
        api.prove(flags, input_path, output_dir);
    };

    // Helper lambda to verify VK equivalence
    auto verify_vk_equivalence = [&](const std::filesystem::path& vk1_path, const ClientIVC::MegaVerificationKey& vk2) {
        auto vk1_data = read_file(vk1_path);
        auto vk1 = from_buffer<ClientIVC::MegaVerificationKey>(vk1_data);
        ASSERT(msgpack::msgpack_check_eq(vk1, vk2, "VK from prove should match VK from write_vk"));
    };

    // Helper lambda to verify proof
    auto verify_proof = [&]() {
        std::filesystem::path proof_path = output_dir / "proof";
        std::filesystem::path vk_path = output_dir / "vk";
        std::filesystem::path public_inputs_path; // Not used for ClientIVC

        ClientIVCAPI::Flags flags;
        ClientIVCAPI verify_api;
        return verify_api.verify(flags, public_inputs_path, proof_path, vk_path);
    };

    // Execute test steps
    create_proof_and_vk();
    verify_vk_equivalence(output_dir / "vk", ivc_vk);
    // Test verify command
    EXPECT_TRUE(verify_proof());
}

// Note: very light test!
TEST_F(ClientIVCAPITests, WriteVkFields)
{
    // Create a simple circuit bytecode
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    // Compress and write bytecode to file
    std::filesystem::path bytecode_path = test_dir / "circuit.acir";
    write_file(bytecode_path, compress(bytecode));

    // Test write_vk with fields output format
    ClientIVCAPI::Flags flags;
    flags.verifier_type = "standalone";
    flags.output_format = "fields";

    ClientIVCAPI api;
    api.write_vk(flags, bytecode_path, test_dir);

    // Read and verify the fields format
    auto vk_data = read_file(test_dir / "vk_fields.json");
    std::string vk_str(vk_data.begin(), vk_data.end());
    // Just check that this looks a bit like JSON.
    EXPECT_NE(vk_str.find('['), std::string::npos);
    EXPECT_NE(vk_str.find(']'), std::string::npos);
}

TEST_F(ClientIVCAPITests, GatesCommand)
{
    // Create a simple circuit bytecode
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    // Write compressed bytecode to file
    std::filesystem::path bytecode_path = test_dir / "circuit.acir";
    write_file(bytecode_path, compress(bytecode));

    ClientIVCAPI::Flags flags;
    flags.include_gates_per_opcode = true;

    // Redirect stdout to a stringstream
    std::ostringstream captured_output;
    std::streambuf* old_cout = std::cout.rdbuf(captured_output.rdbuf());

    ClientIVCAPI api;
    api.gates(flags, bytecode_path);

    // Restore stdout
    std::cout.rdbuf(old_cout);
    std::string output = captured_output.str();

    // We rudimentarily output to this pattern:
    // {"functions": [
    //     {
    //           "acir_opcodes": 1,
    //           "circuit_size": *,
    //           "gates_per_opcode": [*]
    //     }
    //   ]}
    EXPECT_NE(output.find("\"functions\": ["), std::string::npos);
    EXPECT_NE(output.find("\"acir_opcodes\": 1"), std::string::npos);
    EXPECT_NE(output.find("\"circuit_size\": "), std::string::npos);
    EXPECT_NE(output.find("\"gates_per_opcode\": ["), std::string::npos);
}

TEST_F(ClientIVCAPITests, ProveAndVerifyCommand)
{
    // Create test input file
    std::filesystem::path input_path = test_dir / "input.msgpack";
    create_test_private_execution_steps(input_path);

    ClientIVCAPI api;
    EXPECT_TRUE(api.prove_and_verify(input_path));
}

TEST_F(ClientIVCAPITests, CheckPrecomputedVks)
{
    // Create test input file with precomputed VKs
    std::filesystem::path input_path = test_dir / "input_with_vks.msgpack";
    create_test_private_execution_steps(input_path);

    ClientIVCAPI api;
    EXPECT_TRUE(api.check_precomputed_vks(input_path));
}

TEST_F(ClientIVCAPITests, CheckPrecomputedVksMismatch)
{
    using namespace acir_format;

    // Create a simple circuit
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    bbrpc::BBRpcRequest request;
    size_t vk_size =
        from_buffer<MegaFlavor::VerificationKey>(
            bbrpc::execute(request,
                           bbrpc::ClientIvcComputeVk{ .circuit = { .name = "simple_circuit", .bytecode = bytecode },
                                                      .standalone = true })
                .verification_key)
            .to_field_elements()
            .size();

    // Create a WRONG verification key (use a different circuit)
    auto different_bytecode = create_simple_kernel(vk_size, false);
    auto vk = bbrpc::execute(
                  request,
                  bbrpc::ClientIvcComputeVk{ .circuit = { .name = "different_circuit", .bytecode = different_bytecode },
                                             .standalone = true })
                  .verification_key;

    // Create PrivateExecutionStepRaw with wrong VK
    std::vector<PrivateExecutionStepRaw> raw_steps;
    PrivateExecutionStepRaw step;
    step.bytecode = bytecode;
    step.witness = witness_data;
    step.vk = std::move(vk); // Wrong VK
    step.function_name = "test_function";
    raw_steps.push_back(std::move(step));

    // Write to file using compress_and_save
    std::filesystem::path input_path = test_dir / "input_wrong_vks.msgpack";
    PrivateExecutionStepRaw::compress_and_save(std::move(raw_steps), input_path);

    // Should fail because VK doesn't match
    ClientIVCAPI api;
    bool result = api.check_precomputed_vks(input_path);
    EXPECT_FALSE(result);
}

TEST_F(ClientIVCAPITests, CheckPrecomputedVksMissing)
{
    using namespace acir_format;

    // Create a simple circuit
    auto [bytecode, witness_data] = create_simple_circuit_bytecode();

    // Create PrivateExecutionStepRaw with no VK
    std::vector<PrivateExecutionStepRaw> raw_steps;
    PrivateExecutionStepRaw step;
    step.bytecode = bytecode;
    step.witness = witness_data;
    step.vk = {}; // Empty VK (missing)
    step.function_name = "test_function";
    raw_steps.push_back(std::move(step));

    // Write to file using compress_and_save
    std::filesystem::path input_path = test_dir / "input_missing_vks.msgpack";
    PrivateExecutionStepRaw::compress_and_save(std::move(raw_steps), input_path);

    // Should fail because VK is missing
    ClientIVCAPI api;
    bool result = api.check_precomputed_vks(input_path);
    EXPECT_FALSE(result);
}

TEST_F(ClientIVCAPITests, ProveToStdout)
{
    // Create test input file
    std::filesystem::path input_path = test_dir / "input.msgpack";
    create_test_private_execution_steps(input_path);

    ClientIVCAPI::Flags flags;
    flags.write_vk = false;

    // Use "-" as output dir to write to stdout
    std::filesystem::path output_dir = "-";

    // Capture stdout using standard stream redirection
    std::ostringstream captured_output;
    std::streambuf* old_cout = std::cout.rdbuf(captured_output.rdbuf());

    ClientIVCAPI api;
    api.prove(flags, input_path, output_dir);

    // Restore stdout
    std::cout.rdbuf(old_cout);
    std::string output = captured_output.str();

    // Should have written binary proof data to stdout
    EXPECT_FALSE(output.empty());
}

TEST_F(ClientIVCAPITests, ArbitraryValidProofAndVk)
{
    std::filesystem::path output_dir = test_dir / "arbitrary";
    std::filesystem::create_directories(output_dir);

    write_arbitrary_valid_client_ivc_proof_and_vk_to_file(output_dir);

    // Check that proof and vk files were created
    EXPECT_TRUE(std::filesystem::exists(output_dir / "proof"));
    EXPECT_TRUE(std::filesystem::exists(output_dir / "vk"));

    // Verify the generated proof
    const auto proof = ClientIVC::Proof::from_file_msgpack(output_dir / "proof");
    const auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(output_dir / "vk"));

    const bool verified = ClientIVC::verify(proof, vk);
    EXPECT_TRUE(verified);
}

} // namespace bb
