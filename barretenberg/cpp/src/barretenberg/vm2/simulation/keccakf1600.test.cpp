#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>

#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::ReturnRef;
using ::testing::StrictMock;

void flatten_state(KeccakF1600State state, uint64_t* flattened)
{
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            flattened[(j * 5) + i] = state[i][j];
        }
    }
}

TEST(KeccakSimulationTest, matchesReferenceImplementation)
{
    MemoryStore memory;
    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(memory));

    NoopEventEmitter<KeccakF1600Event> keccak_event_emitter;
    NoopEventEmitter<BitwiseEvent> bitwise_event_emitter;
    NoopEventEmitter<RangeCheckEvent> range_check_event_emitter;

    Bitwise bitwise(bitwise_event_emitter);
    RangeCheck range_check(range_check_event_emitter);
    KeccakF1600 keccak(keccak_event_emitter, bitwise, range_check);

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

    keccak.permutation(context, dst_addr, src_addr);
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

} // namespace
} // namespace bb::avm2::simulation
