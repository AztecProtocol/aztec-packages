#include "api_ultra_honk.hpp"
#include "barretenberg/api/api.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <chrono>
#include <cstddef>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <gtest/gtest.h>
#include <stdexcept>
#include <string>
#include <vector>

namespace bb {
std::vector<uint8_t> compress(const std::vector<uint8_t>& input);
}

namespace {
using namespace bb;

// Create a unique temporary directory for each test run
std::filesystem::path get_test_dir(const std::string_view& test_name)
{
    std::filesystem::path temp_dir = "tmp_api_ultra_honk_test";
    std::filesystem::create_directories(temp_dir);
    std::filesystem::create_directories(temp_dir / test_name);
    return temp_dir / test_name;
}

class ApiUltraHonkTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        bb::srs::init_bn254_net_crs_factory("../srs_db/bn254");
        bb::srs::init_grumpkin_net_crs_factory("../srs_db/grumpkin");
    }

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

/**
 * @brief Test basic proof generation and verification using UltraHonkAPI
 */
TEST_F(ApiUltraHonkTest, ProveAndVerify)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Write to temporary files
    auto bytecode_path = test_dir / "bytecode";
    auto witness_path = test_dir / "witness";
    auto vk_dir = test_dir / "vk_output";
    auto proof_dir = test_dir / "proof_dir";

    write_file(bytecode_path, compress(bytecode));
    write_file(witness_path, compress(witness_data));
    std::filesystem::create_directories(vk_dir);
    std::filesystem::create_directories(proof_dir);

    UltraHonkAPI api;
    API::Flags flags;
    flags.oracle_hash_type = "poseidon2"; // Set default oracle hash type
    flags.output_format = "bytes";        // Set output format

    // Compute and write VK
    api.write_vk(flags, bytecode_path, vk_dir);
    auto vk_path = vk_dir / "vk";
    EXPECT_TRUE(std::filesystem::exists(vk_path));

    // Generate proof
    api.prove(flags, bytecode_path, witness_path, vk_path, proof_dir);

    auto proof_path = proof_dir / "proof";
    auto public_inputs_path = proof_dir / "public_inputs";
    EXPECT_TRUE(std::filesystem::exists(proof_path));
    EXPECT_TRUE(std::filesystem::exists(public_inputs_path));

    // Verify proof
    bool verified = api.verify(flags, public_inputs_path, proof_path, vk_path);
    EXPECT_TRUE(verified);
}

/**
 * @brief Test gates function
 */
TEST_F(ApiUltraHonkTest, GateCount)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Write to temporary file
    auto bytecode_path = test_dir / "bytecode";
    write_file(bytecode_path, compress(bytecode));

    UltraHonkAPI api;
    API::Flags flags;
    flags.oracle_hash_type = "poseidon2"; // Set default oracle hash type
    flags.output_format = "bytes";        // Set output format

    // This should print gate count information to stdout
    // We can't easily test the output, but we can verify it doesn't crash
    testing::internal::CaptureStdout();
    api.gates(flags, bytecode_path);
    std::string output = testing::internal::GetCapturedStdout();

    // Basic check that some output was produced
    EXPECT_FALSE(output.empty());
    EXPECT_NE(output.find("circuit_size"), std::string::npos);
}

/**
 * @brief Test write_solidity_verifier function
 */
TEST_F(ApiUltraHonkTest, WriteSolidityVerifier)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Write to temporary files
    auto bytecode_path = test_dir / "bytecode";
    auto vk_dir = test_dir / "vk_output";
    auto verifier_path = test_dir / "Verifier.sol";

    write_file(bytecode_path, compress(bytecode));
    std::filesystem::create_directories(vk_dir);

    UltraHonkAPI api;
    API::Flags flags;
    flags.oracle_hash_type = "poseidon2"; // Set default oracle hash type
    flags.output_format = "bytes";        // Set output format

    // First compute and write VK
    api.write_vk(flags, bytecode_path, vk_dir);
    auto vk_path = vk_dir / "vk";
    EXPECT_TRUE(std::filesystem::exists(vk_path));

    // Generate Solidity verifier
    api.write_solidity_verifier(flags, verifier_path, vk_path);
    EXPECT_TRUE(std::filesystem::exists(verifier_path));

    // Check that the file contains Solidity code
    std::ifstream verifier_file(verifier_path);
    std::string content((std::istreambuf_iterator<char>(verifier_file)), std::istreambuf_iterator<char>());
    EXPECT_NE(content.find("pragma solidity"), std::string::npos);
    EXPECT_NE(content.find("contract"), std::string::npos);
}

/**
 * @brief Test verification fails with wrong public inputs
 */
TEST_F(ApiUltraHonkTest, DISABLED_VerificationFailsWithWrongPublicInputs)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Write to temporary files
    auto bytecode_path = test_dir / "bytecode";
    auto witness_path = test_dir / "witness";
    auto vk_dir = test_dir / "vk_output";
    auto proof_dir = test_dir / "proof_dir";

    write_file(bytecode_path, compress(bytecode));
    write_file(witness_path, compress(witness_data));
    std::filesystem::create_directories(vk_dir);
    std::filesystem::create_directories(proof_dir);

    UltraHonkAPI api;
    API::Flags flags;
    flags.oracle_hash_type = "poseidon2"; // Set default oracle hash type
    flags.output_format = "bytes";        // Set output format

    // Compute and write VK
    api.write_vk(flags, bytecode_path, vk_dir);
    auto vk_path = vk_dir / "vk";

    // Generate proof
    api.prove(flags, bytecode_path, witness_path, vk_path, proof_dir);

    auto proof_path = proof_dir / "proof";
    auto public_inputs_path = proof_dir / "public_inputs";

    // Modify public inputs
    auto public_inputs_data = read_file(public_inputs_path);
    if (!public_inputs_data.empty()) {
        // Corrupt more bytes to ensure the field element is changed
        // Public inputs are serialized as field elements (32 bytes each)
        // Corrupt the first field element completely
        for (size_t i = 0; i < std::min(32UL, public_inputs_data.size()); ++i) {
            public_inputs_data[i] = ~public_inputs_data[i];
        }
    }

    auto wrong_public_inputs_path = test_dir / "wrong_public_inputs";
    write_file(wrong_public_inputs_path, public_inputs_data);

    // Verify proof with wrong public inputs - should fail
    bool verified = api.verify(flags, wrong_public_inputs_path, proof_path, vk_path);
    EXPECT_FALSE(verified);
}

/**
 * @brief Test with different proof system settings
 */
TEST_F(ApiUltraHonkTest, ProveWithDifferentSettings)
{
    // Create a simple circuit
    auto [bytecode, witness_data] = acir_bincode_mocks::create_simple_circuit_bytecode();

    // Write to temporary files
    auto bytecode_path = test_dir / "bytecode";
    auto witness_path = test_dir / "witness";
    auto vk_dir = test_dir / "vk_output";
    auto proof_dir = test_dir / "proof_dir";

    write_file(bytecode_path, compress(bytecode));
    write_file(witness_path, compress(witness_data));
    std::filesystem::create_directories(vk_dir);
    std::filesystem::create_directories(proof_dir);

    UltraHonkAPI api;

    // Test with disable_zk = true
    {
        API::Flags flags;
        flags.disable_zk = true;
        flags.oracle_hash_type = "poseidon2";
        flags.output_format = "bytes";

        // Compute and write VK
        api.write_vk(flags, bytecode_path, vk_dir);
        auto vk_path = vk_dir / "vk";

        // Generate proof
        api.prove(flags, bytecode_path, witness_path, vk_path, proof_dir);

        auto proof_path = proof_dir / "proof";
        auto public_inputs_path = proof_dir / "public_inputs";

        // Verify proof
        bool verified = api.verify(flags, public_inputs_path, proof_path, vk_path);
        EXPECT_TRUE(verified);
    }

    // Clean up for next test
    std::filesystem::remove_all(proof_dir);
    std::filesystem::create_directories(proof_dir);

    // Test with ipa_accumulation = true
    {
        API::Flags flags;
        flags.ipa_accumulation = true;
        flags.oracle_hash_type = "poseidon2";
        flags.output_format = "bytes";

        // Compute and write VK
        api.write_vk(flags, bytecode_path, vk_dir);
        auto vk_path = vk_dir / "vk";

        // Generate proof
        api.prove(flags, bytecode_path, witness_path, vk_path, proof_dir);

        auto proof_path = proof_dir / "proof";
        auto public_inputs_path = proof_dir / "public_inputs";

        // Verify proof
        bool verified = api.verify(flags, public_inputs_path, proof_path, vk_path);
        EXPECT_TRUE(verified);
    }
}

} // namespace
