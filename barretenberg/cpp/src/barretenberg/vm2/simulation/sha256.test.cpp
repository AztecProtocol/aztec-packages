#include "barretenberg/vm2/simulation/sha256.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_store.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/lib/sha256_compression.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::ReturnRef;
using ::testing::StrictMock;

TEST(Sha256CompressionSimulationTest, Sha256Compression)
{
    MemoryStore mem;
    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(mem));

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256(sha256_event_emitter);

    // TODO: actually can choose to mock, not even use a memory, check the events, etc.
    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress dst_addr = 25;

    sha256.compression(context, state_addr, input_addr, dst_addr);

    auto result = sha256_block(state, input);

    std::array<uint32_t, 8> result_from_memory;
    for (uint32_t i = 0; i < 8; ++i) {
        auto c = mem.get(dst_addr + i);
        result_from_memory[i] = c.as<uint32_t>();
    }
    EXPECT_EQ(result_from_memory, result);
}

} // namespace
} // namespace bb::avm2::simulation
