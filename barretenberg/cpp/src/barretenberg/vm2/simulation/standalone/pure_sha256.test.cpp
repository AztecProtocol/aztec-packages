#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_sha256.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

using ::testing::ElementsAreArray;

namespace bb::avm2::simulation {
namespace {

class PureSha256Test : public ::testing::Test {
  protected:
    MemoryStore memory;
    PureSha256 sha256;
};

TEST_F(PureSha256Test, CompressionMatchesCryptoImplementation)
{
    std::array<uint32_t, 8> state = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    };

    std::array<uint32_t, 16> input = {
        0x61626380, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
        0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000018,
    };

    MemoryAddress state_addr = 100;
    MemoryAddress input_addr = 200;
    MemoryAddress output_addr = 300;

    // Set up memory
    for (size_t i = 0; i < 8; ++i) {
        memory.set(static_cast<MemoryAddress>(state_addr + i), MemoryValue::from<uint32_t>(state[i]));
    }
    for (size_t i = 0; i < 16; ++i) {
        memory.set(static_cast<MemoryAddress>(input_addr + i), MemoryValue::from<uint32_t>(input[i]));
    }

    // Run compression
    sha256.compression(memory, state_addr, input_addr, output_addr);

    // Expected result using crypto library directly
    std::array<uint32_t, 8> expected_output = crypto::sha256_block(state, input);

    // Verify output
    std::array<uint32_t, 8> actual_output;
    for (size_t i = 0; i < 8; ++i) {
        MemoryValue val = memory.get(static_cast<MemoryAddress>(output_addr + i));
        EXPECT_EQ(val.get_tag(), MemoryTag::U32);
        actual_output[i] = val.as<uint32_t>();
    }

    EXPECT_THAT(actual_output, ElementsAreArray(expected_output));
}

TEST_F(PureSha256Test, InvalidStateTagThrows)
{
    MemoryAddress state_addr = 100;
    MemoryAddress input_addr = 200;
    MemoryAddress output_addr = 300;

    // Set one state value to wrong tag (e.g. U64)
    for (size_t i = 0; i < 8; ++i) {
        memory.set(static_cast<MemoryAddress>(state_addr + i), MemoryValue::from<uint32_t>(0));
    }
    memory.set(state_addr, MemoryValue::from<uint64_t>(0)); // Wrong tag

    for (size_t i = 0; i < 16; ++i) {
        memory.set(static_cast<MemoryAddress>(input_addr + i), MemoryValue::from<uint32_t>(0));
    }

    EXPECT_THROW_WITH_MESSAGE(sha256.compression(memory, state_addr, input_addr, output_addr),
                              "Sha256CompressionException: Invalid tag for sha256 state values.");
}

TEST_F(PureSha256Test, InvalidInputTagThrows)
{
    MemoryAddress state_addr = 100;
    MemoryAddress input_addr = 200;
    MemoryAddress output_addr = 300;

    for (size_t i = 0; i < 8; ++i) {
        memory.set(static_cast<MemoryAddress>(state_addr + i), MemoryValue::from<uint32_t>(0));
    }
    for (size_t i = 0; i < 16; ++i) {
        memory.set(static_cast<MemoryAddress>(input_addr + i), MemoryValue::from<uint32_t>(0));
    }
    // Set one input value to wrong tag
    memory.set(static_cast<MemoryAddress>(input_addr + 5), MemoryValue::from<uint64_t>(0));

    EXPECT_THROW_WITH_MESSAGE(sha256.compression(memory, state_addr, input_addr, output_addr),
                              "Sha256CompressionException: Invalid tag for sha256 input values.");
}

TEST_F(PureSha256Test, StateAddressOutOfRangeThrows)
{
    MemoryAddress state_addr = AVM_HIGHEST_MEM_ADDRESS - 6; // state_addr + 7 > HIGHEST
    MemoryAddress input_addr = 200;
    MemoryAddress output_addr = 300;

    EXPECT_THROW_WITH_MESSAGE(sha256.compression(memory, state_addr, input_addr, output_addr),
                              "Sha256CompressionException: Memory address out of range for sha256 compression.");
}

TEST_F(PureSha256Test, InputAddressOutOfRangeThrows)
{
    MemoryAddress state_addr = 100;
    MemoryAddress input_addr = AVM_HIGHEST_MEM_ADDRESS - 14; // input_addr + 15 > HIGHEST
    MemoryAddress output_addr = 300;

    EXPECT_THROW_WITH_MESSAGE(sha256.compression(memory, state_addr, input_addr, output_addr),
                              "Sha256CompressionException: Memory address out of range for sha256 compression.");
}

TEST_F(PureSha256Test, OutputAddressOutOfRangeThrows)
{
    MemoryAddress state_addr = 100;
    MemoryAddress input_addr = 200;
    MemoryAddress output_addr = AVM_HIGHEST_MEM_ADDRESS - 6; // output_addr + 7 > HIGHEST

    EXPECT_THROW_WITH_MESSAGE(sha256.compression(memory, state_addr, input_addr, output_addr),
                              "Sha256CompressionException: Memory address out of range for sha256 compression.");
}

} // namespace
} // namespace bb::avm2::simulation
