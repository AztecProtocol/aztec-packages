#include "api_ultra_honk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include <chrono>
#include <cstddef>
#include <cstdlib>
#include <filesystem>
#include <gtest/gtest.h>
#include <math.h>
#include <sstream>
#include <string_view>

namespace bb {
std::vector<uint8_t> compress(const std::vector<uint8_t>& input);
std::vector<uint8_t> decompress(const void* bytes, size_t size);
} // namespace bb

using namespace bb;

namespace {
// Create a unique temporary directory for each test run
// Uniqueness needed because tests are run in parallel and write to same file names.
std::filesystem::path get_test_dir(const std::string_view& test_name)
{
    std::filesystem::path temp_dir = "tmp_api_ultra_honk_test";
    std::filesystem::create_directories(temp_dir);
    std::filesystem::create_directories(temp_dir / test_name);
    return temp_dir / test_name;
}

// Create test data
std::pair<std::filesystem::path, std::filesystem::path> create_test_circuit_files(const std::filesystem::path& test_dir)
{
    auto [bytecode, witness] = acir_bincode_mocks::create_simple_circuit_bytecode();

    auto bytecode_path = test_dir / "circuit.gz";
    auto witness_path = test_dir / "witness.gz";

    write_file(bytecode_path, bb::compress(bytecode));
    write_file(witness_path, bb::compress(witness));

    return { bytecode_path, witness_path };
}

} // namespace

class ApiUltraHonkTest : public ::testing::Test {
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

TEST_F(ApiUltraHonkTest, ProveAndVerify)
{
    auto [bytecode_path, witness_path] = create_test_circuit_files(test_dir);

    API::Flags flags;
    flags.oracle_hash_type = "poseidon2"; // Set default oracle hash type

    UltraHonkAPI api;

    // Generate VK first
    auto vk_output_path = test_dir / "vk";
    std::filesystem::create_directories(vk_output_path);
    api.write_vk(flags, bytecode_path, vk_output_path);
    EXPECT_TRUE(std::filesystem::exists(vk_output_path / "vk"));

    // Generate proof
    auto proof_output_dir = test_dir / "proof";
    std::filesystem::create_directories(proof_output_dir);
    api.prove(flags, bytecode_path, witness_path, vk_output_path / "vk", proof_output_dir);

    // Check that proof files were created
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "proof"));
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "public_inputs"));

    // Verify the proof
    bool verified =
        api.verify(flags, proof_output_dir / "public_inputs", proof_output_dir / "proof", vk_output_path / "vk");
    EXPECT_TRUE(verified);
}

TEST_F(ApiUltraHonkTest, ProveWithWriteVk)
{
    auto [bytecode_path, witness_path] = create_test_circuit_files(test_dir);

    API::Flags flags;
    flags.oracle_hash_type = "poseidon2";
    flags.write_vk = true;

    UltraHonkAPI api;

    // Generate proof with write_vk flag (will compute and write VK)
    auto proof_output_dir = test_dir / "proof";
    std::filesystem::create_directories(proof_output_dir);
    api.prove(flags, bytecode_path, witness_path, "", proof_output_dir);

    // Check that proof and VK files were created
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "proof"));
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "public_inputs"));
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "vk"));
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "vk_hash"));

    // Verify the proof
    bool verified =
        api.verify(flags, proof_output_dir / "public_inputs", proof_output_dir / "proof", proof_output_dir / "vk");
    EXPECT_TRUE(verified);
}

TEST_F(ApiUltraHonkTest, ProveAndVerifyWithFields)
{
    auto [bytecode_path, witness_path] = create_test_circuit_files(test_dir);

    // First generate VK for the prove step
    API::Flags vk_flags;
    vk_flags.oracle_hash_type = "poseidon2";

    UltraHonkAPI api;

    auto vk_output_path = test_dir / "vk";
    std::filesystem::create_directories(vk_output_path);
    api.write_vk(vk_flags, bytecode_path, vk_output_path);
    EXPECT_TRUE(std::filesystem::exists(vk_output_path / "vk"));

    // Now test proof generation
    API::Flags flags;
    flags.oracle_hash_type = "poseidon2";

    // Generate proof
    auto proof_output_dir = test_dir / "proof";
    std::filesystem::create_directories(proof_output_dir);
    api.prove(flags, bytecode_path, witness_path, vk_output_path / "vk", proof_output_dir);

    // Check that proof files were created
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "proof"));
    EXPECT_TRUE(std::filesystem::exists(proof_output_dir / "public_inputs"));
}

TEST_F(ApiUltraHonkTest, ProveWithDifferentSettings)
{
    auto [bytecode_path, witness_path] = create_test_circuit_files(test_dir);

    // Test different oracle hash types
    const std::vector<std::pair<std::string, bool>> test_cases = { { "poseidon2",
                                                                     false }, // oracle_hash_type, disable_zk
                                                                   { "poseidon2", true },
                                                                   { "keccak", false },
                                                                   { "keccak", true } };

    for (const auto& [oracle_hash_type, disable_zk] : test_cases) {
        API::Flags flags;
        flags.oracle_hash_type = oracle_hash_type;
        flags.disable_zk = disable_zk;
        flags.write_vk = true;

        auto case_dir = test_dir / (oracle_hash_type + "_" + (disable_zk ? "no_zk" : "zk"));
        std::filesystem::create_directories(case_dir);

        UltraHonkAPI api;

        // Generate proof
        api.prove(flags, bytecode_path, witness_path, "", case_dir);

        // Verify the proof
        bool verified = api.verify(flags, case_dir / "public_inputs", case_dir / "proof", case_dir / "vk");
        EXPECT_TRUE(verified) << "Failed with oracle_hash_type=" << oracle_hash_type << ", disable_zk=" << disable_zk;
    }
}

TEST_F(ApiUltraHonkTest, WriteVk)
{
    auto [bytecode_path, witness_path] = create_test_circuit_files(test_dir);
    API::Flags flags;
    flags.oracle_hash_type = "poseidon2";

    UltraHonkAPI api;
    api.write_vk(flags, bytecode_path, test_dir);

    // Test against bbapi::CircuitComputeVk
    auto bytecode = read_file(bytecode_path);
    auto expected_vk =
        bbapi::CircuitComputeVk({ .circuit = { .bytecode = bb::decompress(bytecode.data(), bytecode.size()) },
                                  .settings = { .oracle_hash_type = flags.oracle_hash_type } })
            .execute();

    info("after write_vk, expected_vk size: {}", expected_vk.bytes.size());
    EXPECT_EQ(expected_vk.bytes, read_file(test_dir / "vk"));
    EXPECT_EQ(expected_vk.hash, read_file(test_dir / "vk_hash"));

    // Verify round-trip: decode the VK and check that to_field_elements() matches
    auto vk_from_bytes = from_buffer<UltraFlavor::VerificationKey>(expected_vk.bytes);
    auto vk_from_file = from_buffer<UltraFlavor::VerificationKey>(read_file(test_dir / "vk"));
    EXPECT_EQ(vk_from_bytes.to_field_elements(), vk_from_file.to_field_elements());
}

// NOTE: very light test
TEST_F(ApiUltraHonkTest, GatesWithOpcodesSmokeTest)
{
    auto [bytecode_path, witness_path] = create_test_circuit_files(test_dir);

    // Capture stdout
    testing::internal::CaptureStdout();

    API::Flags flags;
    flags.oracle_hash_type = "poseidon2";
    flags.include_gates_per_opcode = true;
    UltraHonkAPI api;
    api.gates(flags, bytecode_path);

    std::string output = testing::internal::GetCapturedStdout();

    // Check that output contains per-opcode information
    EXPECT_TRUE(output.find("gates_per_opcode") != std::string::npos);
}
