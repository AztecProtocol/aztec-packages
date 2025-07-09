#include "api_client_ivc.hpp"
#include "barretenberg/api/bbapi.hpp"
#include "barretenberg/api/bbapi_execute.hpp"
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
#include <cstdlib>
#include <filesystem>
#include <gtest/gtest.h>
#include <sstream>
#include <string_view>

using namespace bb;

namespace {
// Create a unique temporary directory for each test run
// Uniqueness needed because tests are run in parallel and write to same file names.
std::filesystem::path get_test_dir(const std::string_view& test_name)
{
    std::filesystem::path temp_dir = "tmp_api_client_ivc_test";
    std::filesystem::create_directories(temp_dir);
    std::filesystem::create_directories(temp_dir / test_name);
    return temp_dir / test_name;
}

void create_test_private_execution_steps(const std::filesystem::path& output_path)
{
    using namespace acir_format;

    // First create a simple app circuit
    auto [app_bytecode, app_witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Get the VK for the app circuit
    bbapi::BBApiRequest request;

    auto app_vk_response = bbapi::execute(
        request, bbapi::ClientIvcComputeStandaloneVk{ .circuit = { .name = "app_circuit", .bytecode = app_bytecode } });
    auto app_vk = app_vk_response.template get<bbapi::ClientIvcComputeStandaloneVk::Response>().bytes;
    auto app_vk_fields = from_buffer<MegaFlavor::VerificationKey>(app_vk).to_field_elements();

    // Now create a kernel circuit that verifies the app circuit
    auto kernel_bytecode = acir_bincode_mocks::create_simple_kernel(app_vk_fields.size(), /*is_init_kernel=*/true);
    auto kernel_witness_data = acir_bincode_mocks::create_kernel_witness(app_vk_fields);

    auto kernel_vk_response = bbapi::execute(
        request,
        bbapi::ClientIvcComputeStandaloneVk{ .circuit = { .name = "kernel_circuit", .bytecode = kernel_bytecode } });
    auto kernel_vk = kernel_vk_response.template get<bbapi::ClientIvcComputeStandaloneVk::Response>().bytes;

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
} // namespace

class ClientIVCAPITests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    void SetUp() override
    {
        const auto* info = ::testing::UnitTest::GetInstance()->current_test_info();
        test_dir = get_test_dir(info->name());
    }

    void TearDown() override
    {
        if (std::filesystem::exists(test_dir)) {
            std::filesystem::remove_all(test_dir);
        }
    }

    std::filesystem::path test_dir;
};

namespace bb {
std::vector<uint8_t> compress(const std::vector<uint8_t>& input);
}

// Used to get a mock IVC vk.
ClientIVC::MegaVerificationKey get_ivc_vk(const std::filesystem::path& test_dir)
{
    auto [app_bytecode, app_witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();
    bbapi::BBApiRequest request;
    auto app_vk_response = bbapi::execute(
        request, bbapi::ClientIvcComputeStandaloneVk{ .circuit = { .name = "app_circuit", .bytecode = app_bytecode } });
    auto app_vk = app_vk_response.template get<bbapi::ClientIvcComputeStandaloneVk::Response>().bytes;
    auto app_vk_fields = from_buffer<MegaFlavor::VerificationKey>(app_vk).to_field_elements();
    // Use this to get the size of the vk.
    auto bytecode = acir_bincode_mocks::create_simple_kernel(app_vk_fields.size(), /*is_init_kernel=*/false);
    std::filesystem::path bytecode_path = test_dir / "circuit.acir";
    write_file(bytecode_path, bb::compress(bytecode));

    ClientIVCAPI::Flags write_vk_flags;
    write_vk_flags.verifier_type = "ivc";
    write_vk_flags.output_format = "bytes";

    ClientIVCAPI api;
    api.write_vk(write_vk_flags, bytecode_path, test_dir);

    return from_buffer<ClientIVC::MegaVerificationKey>(read_file(test_dir / "vk"));
};

// Test the ClientIVCAPI::prove flow, making sure --write_vk
// returns the same output as our ivc VK generation.
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

// WORKTODO(bbapi): Expand on this.
TEST_F(ClientIVCAPITests, WriteVkFieldsSmokeTest)
{
    // Create a simple circuit bytecode
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Compress and write bytecode to file
    std::filesystem::path bytecode_path = test_dir / "circuit.acir";
    write_file(bytecode_path, bb::compress(bytecode));

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

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1461): Make this test actually test # gates
TEST_F(ClientIVCAPITests, GatesCommandSmokeTest)
{
    // Create a simple circuit bytecode
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Write compressed bytecode to file
    std::filesystem::path bytecode_path = test_dir / "circuit.acir";
    write_file(bytecode_path, bb::compress(bytecode));

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

// Test prove_and_verify for our example IVC flow.
TEST_F(ClientIVCAPITests, ProveAndVerifyCommand)
{
    // Create test input file
    std::filesystem::path input_path = test_dir / "input.msgpack";
    create_test_private_execution_steps(input_path);

    ClientIVCAPI api;
    EXPECT_TRUE(api.prove_and_verify(input_path));
}

// Check a case where precomputed VKs match
TEST_F(ClientIVCAPITests, CheckPrecomputedVks)
{
    // Create test input file with precomputed VKs
    std::filesystem::path input_path = test_dir / "input_with_vks.msgpack";
    create_test_private_execution_steps(input_path);

    ClientIVCAPI api;
    EXPECT_TRUE(api.check_precomputed_vks(input_path));
}

// Check a case where precomputed VKs don't match
TEST_F(ClientIVCAPITests, CheckPrecomputedVksMismatch)
{
    using namespace acir_format;

    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    bbapi::BBApiRequest request;
    size_t vk_size = from_buffer<MegaFlavor::VerificationKey>(
                         bbapi::execute(request,
                                        bbapi::ClientIvcComputeStandaloneVk{
                                            .circuit = { .name = "simple_circuit", .bytecode = bytecode } })
                             .vk_bytes)
                         .to_field_elements()
                         .size();

    // Create a WRONG verification key (use a different circuit)
    auto different_bytecode = acir_bincode_mocks::create_simple_kernel(vk_size, /*is_init_kernel=*/true);
    auto vk = bbapi::execute(request,
                             bbapi::ClientIvcComputeStandaloneVk{
                                 .circuit = { .name = "different_circuit", .bytecode = different_bytecode } })
                  .vk_bytes;

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
