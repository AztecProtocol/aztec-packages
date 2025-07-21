#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>

#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {
namespace {

class KeccakSimulationTest : public ::testing::Test {
  protected:
    KeccakSimulationTest()
        : execution_id_manager(1)
        , bitwise(bitwise_event_emitter)
        , range_check(range_check_event_emitter)
        , keccak(execution_id_manager, keccak_event_emitter, bitwise, range_check)
    {}

    MemoryStore memory;
    ExecutionIdManager execution_id_manager;
    NoopEventEmitter<KeccakF1600Event> keccak_event_emitter;
    NoopEventEmitter<BitwiseEvent> bitwise_event_emitter;
    NoopEventEmitter<RangeCheckEvent> range_check_event_emitter;
    Bitwise bitwise;
    RangeCheck range_check;
    KeccakF1600 keccak;
};

void flatten_state(KeccakF1600State state, uint64_t* flattened)
{
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            flattened[(j * 5) + i] = state[i][j];
        }
    }
}

TEST_F(KeccakSimulationTest, matchesReferenceImplementation)
{
    KeccakF1600State input = {
        { { 0, 1, 2, 3, 4 }, { 5, 6, 7, 8, 9 }, { 10, 11, 12, 13, 14 }, { 15, 16, 17, 18, 19 }, { 20, 21, 22, 23, 24 } }
    };

    const MemoryAddress src_addr = 1979;
    const MemoryAddress dst_addr = 3030;

    uint64_t reference_input[25];
    uint64_t flat_output[25];
    flatten_state(input, reference_input);

    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            memory.set(src_addr + static_cast<MemoryAddress>((i * 5) + j), MemoryValue::from<uint64_t>(input[i][j]));
        }
    }

    keccak.permutation(memory, dst_addr, src_addr);
    KeccakF1600State output;

    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            MemoryValue val = memory.get(dst_addr + static_cast<MemoryAddress>((i * 5) + j));
            EXPECT_EQ(val.get_tag(), MemoryTag::U64);
            output[i][j] = val.as<uint64_t>();
        }
    }

    flatten_state(output, flat_output);

    ethash_keccakf1600(reference_input); // Mutate input
    EXPECT_THAT(reference_input, testing::ElementsAreArray(flat_output));
}

// We simulate a tag error in the memory read.
// We test that an exception of type KeccakF1600Exception is thrown with the string
// "Read slice tag invalid - addr: 1979 tag: 6 (MemoryTag::U128)"
TEST_F(KeccakSimulationTest, tagError)
{
    const MemoryAddress src_addr = 1970;
    const MemoryAddress src_addr_wrong_tag = 1979;
    const MemoryAddress dst_addr = 3030;
    const MemoryTag wrong_tag = MemoryTag::U128;

    // Initialize the full slice with U64 values
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            memory.set(src_addr + static_cast<MemoryAddress>((i * 5) + j),
                       MemoryValue::from_tag_truncating(MemoryTag::U64, (i * 5) + j));
        }
    }

    // Override just the first value with U128 to trigger the tag error
    memory.set(src_addr_wrong_tag, MemoryValue::from_tag_truncating(wrong_tag, 0));

    EXPECT_THROW_WITH_MESSAGE(
        keccak.permutation(memory, dst_addr, src_addr),
        format("Read slice tag invalid - addr: ", src_addr_wrong_tag, " tag: ", static_cast<uint32_t>(wrong_tag)));
}

TEST_F(KeccakSimulationTest, srcSliceOutOfBounds)
{
    const MemoryAddress src_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;
    const MemoryAddress dst_addr = 3030;

    EXPECT_THROW_WITH_MESSAGE(keccak.permutation(memory, dst_addr, src_addr), "Read slice out of range");
}

TEST_F(KeccakSimulationTest, dstSliceOutOfBounds)
{
    const MemoryAddress src_addr = 1970;
    const MemoryAddress dst_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;

    EXPECT_THROW_WITH_MESSAGE(keccak.permutation(memory, dst_addr, src_addr), "Write slice out of range");
}

} // namespace
} // namespace bb::avm2::simulation
