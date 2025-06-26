#include "private_execution_steps.hpp"
#include "barretenberg/client_ivc/acir_bincode_mocks.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <chrono>
#include <filesystem>
#include <gtest/gtest.h>

namespace bb {

using namespace acir_bincode_test;

// Forward declaration of compress function from private_execution_steps.cpp
std::vector<uint8_t> compress(const std::vector<uint8_t>& input);

class PrivateExecutionStepsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    void SetUp() override
    {
        // Create a unique temporary file in the current directory
        test_file = "test_private_execution_steps_" +
                    std::to_string(std::chrono::system_clock::now().time_since_epoch().count()) + ".msgpack";
    }

    void TearDown() override
    {
        // Clean up the temporary file
        if (std::filesystem::exists(test_file)) {
            std::filesystem::remove(test_file);
        }
    }

    std::filesystem::path test_file;
};

TEST_F(PrivateExecutionStepsTests, CompressAndSaveLoadAndDecompress)
{
    // Create test data
    auto [bytecode1, witness1] = create_simple_circuit_bytecode();
    auto [bytecode2, witness2] = create_simple_circuit_bytecode();

    // Create some dummy VK data
    std::vector<uint8_t> vk1 = { 0x01, 0x02, 0x03, 0x04, 0x05 };
    std::vector<uint8_t> vk2 = { 0x06, 0x07, 0x08, 0x09, 0x0a };

    // Create PrivateExecutionStepRaw objects
    std::vector<PrivateExecutionStepRaw> original_steps;
    original_steps.push_back(
        { .bytecode = bytecode1, .witness = witness1, .vk = vk1, .function_name = "test_function_1" });
    original_steps.push_back(
        { .bytecode = bytecode2, .witness = witness2, .vk = vk2, .function_name = "test_function_2" });

    // Save the steps
    PrivateExecutionStepRaw::compress_and_save(std::move(original_steps), test_file);

    // Verify the file was created
    EXPECT_TRUE(std::filesystem::exists(test_file));

    // Load and decompress the steps
    auto loaded_steps = PrivateExecutionStepRaw::load_and_decompress(test_file);

    // Verify we got the same number of steps
    EXPECT_EQ(loaded_steps.size(), 2);

    // Verify the data matches
    EXPECT_EQ(loaded_steps[0].bytecode, bytecode1);
    EXPECT_EQ(loaded_steps[0].witness, witness1);
    EXPECT_EQ(loaded_steps[0].vk, vk1);
    EXPECT_EQ(loaded_steps[0].function_name, "test_function_1");

    EXPECT_EQ(loaded_steps[1].bytecode, bytecode2);
    EXPECT_EQ(loaded_steps[1].witness, witness2);
    EXPECT_EQ(loaded_steps[1].vk, vk2);
    EXPECT_EQ(loaded_steps[1].function_name, "test_function_2");
}

TEST_F(PrivateExecutionStepsTests, CompressAndSaveEmptySteps)
{
    // Test with empty steps vector
    std::vector<PrivateExecutionStepRaw> empty_steps;

    // Save empty steps
    PrivateExecutionStepRaw::compress_and_save(std::move(empty_steps), test_file);

    // Verify the file was created
    EXPECT_TRUE(std::filesystem::exists(test_file));

    // Load and decompress
    auto loaded_steps = PrivateExecutionStepRaw::load_and_decompress(test_file);

    // Verify it's empty
    EXPECT_EQ(loaded_steps.size(), 0);
}

TEST_F(PrivateExecutionStepsTests, CompressAndSaveLargeData)
{
    // Create a step with large bytecode and witness data
    std::vector<uint8_t> large_bytecode(100000, 0xAB); // 100KB of data
    std::vector<uint8_t> large_witness(50000, 0xCD);   // 50KB of data
    std::vector<uint8_t> vk = { 0x01, 0x02, 0x03 };

    std::vector<PrivateExecutionStepRaw> steps;
    steps.push_back(
        { .bytecode = large_bytecode, .witness = large_witness, .vk = vk, .function_name = "large_data_test" });

    // Save the steps
    PrivateExecutionStepRaw::compress_and_save(std::move(steps), test_file);

    // Get the compressed file size
    auto compressed_size = std::filesystem::file_size(test_file);

    // The compressed size should be significantly smaller than the original
    // (bytecode + witness = 150KB uncompressed)
    EXPECT_LT(compressed_size, 150000);

    // Load and decompress
    auto loaded_steps = PrivateExecutionStepRaw::load_and_decompress(test_file);

    // Verify the data matches
    EXPECT_EQ(loaded_steps.size(), 1);
    EXPECT_EQ(loaded_steps[0].bytecode, large_bytecode);
    EXPECT_EQ(loaded_steps[0].witness, large_witness);
    EXPECT_EQ(loaded_steps[0].vk, vk);
    EXPECT_EQ(loaded_steps[0].function_name, "large_data_test");
}

TEST_F(PrivateExecutionStepsTests, LoadNonExistentFile)
{
    // Try to load a file that doesn't exist
    std::filesystem::path non_existent_file = "non_existent_file.msgpack";

    // This should throw an exception
    EXPECT_THROW(PrivateExecutionStepRaw::load_and_decompress(non_existent_file), std::exception);
}

TEST_F(PrivateExecutionStepsTests, ParseUncompressedData)
{
    // Create test data
    auto [bytecode, witness] = create_simple_circuit_bytecode();
    std::vector<uint8_t> vk = { 0x01, 0x02, 0x03 };

    // Create a step without compression
    std::vector<PrivateExecutionStepRaw> original_steps;
    original_steps.push_back(
        { .bytecode = bytecode, .witness = witness, .vk = vk, .function_name = "uncompressed_test" });

    // Serialize to msgpack without compression
    std::stringstream ss;
    msgpack::pack(ss, original_steps);
    std::string packed_data = ss.str();
    std::vector<uint8_t> buffer(packed_data.begin(), packed_data.end());

    // Parse the uncompressed data
    auto parsed_steps = PrivateExecutionStepRaw::parse_uncompressed(buffer);

    // Verify the data matches
    EXPECT_EQ(parsed_steps.size(), 1);
    EXPECT_EQ(parsed_steps[0].bytecode, bytecode);
    EXPECT_EQ(parsed_steps[0].witness, witness);
    EXPECT_EQ(parsed_steps[0].vk, vk);
    EXPECT_EQ(parsed_steps[0].function_name, "uncompressed_test");
}

TEST_F(PrivateExecutionStepsTests, SelfDecompress)
{
    // Create test data and compress it
    auto [bytecode, witness] = create_simple_circuit_bytecode();

    // Create a step with compressed data
    PrivateExecutionStepRaw step;
    step.bytecode = compress(bytecode);
    step.witness = compress(witness);
    step.vk = { 0x01, 0x02, 0x03 };
    step.function_name = "self_decompress_test";

    // Store the original compressed sizes
    auto compressed_bytecode_size = step.bytecode.size();
    auto compressed_witness_size = step.witness.size();

    // Self decompress
    step.self_decompress();

    // Verify the data was decompressed correctly
    EXPECT_EQ(step.bytecode, bytecode);
    EXPECT_EQ(step.witness, witness);

    // Verify the decompressed data is larger than compressed
    EXPECT_GT(step.bytecode.size(), compressed_bytecode_size);
    EXPECT_GT(step.witness.size(), compressed_witness_size);
}

TEST_F(PrivateExecutionStepsTests, MultipleStepsWithKernel)
{
    // Create an app circuit and a kernel circuit
    auto [app_bytecode, app_witness] = create_simple_circuit_bytecode();

    // Create a simple VK for the app
    std::vector<uint8_t> app_vk = { 0x01, 0x02, 0x03, 0x04 };

    // Create a kernel that would verify the app (simplified)
    auto kernel_bytecode = create_simple_kernel(10, false);
    std::vector<bb::fr> kernel_witness_fields(10, bb::fr(1));
    auto kernel_witness = create_kernel_witness(kernel_witness_fields);
    std::vector<uint8_t> kernel_vk = { 0x05, 0x06, 0x07, 0x08 };

    // Create the steps
    std::vector<PrivateExecutionStepRaw> steps;
    steps.push_back({ .bytecode = app_bytecode, .witness = app_witness, .vk = app_vk, .function_name = "app_circuit" });
    steps.push_back(
        { .bytecode = kernel_bytecode, .witness = kernel_witness, .vk = kernel_vk, .function_name = "kernel_circuit" });

    // Save and load
    PrivateExecutionStepRaw::compress_and_save(std::move(steps), test_file);
    auto loaded_steps = PrivateExecutionStepRaw::load_and_decompress(test_file);

    // Verify both steps were saved and loaded correctly
    EXPECT_EQ(loaded_steps.size(), 2);

    // Verify app circuit
    EXPECT_EQ(loaded_steps[0].bytecode, app_bytecode);
    EXPECT_EQ(loaded_steps[0].witness, app_witness);
    EXPECT_EQ(loaded_steps[0].vk, app_vk);
    EXPECT_EQ(loaded_steps[0].function_name, "app_circuit");

    // Verify kernel circuit
    EXPECT_EQ(loaded_steps[1].bytecode, kernel_bytecode);
    EXPECT_EQ(loaded_steps[1].witness, kernel_witness);
    EXPECT_EQ(loaded_steps[1].vk, kernel_vk);
    EXPECT_EQ(loaded_steps[1].function_name, "kernel_circuit");
}

} // namespace bb
