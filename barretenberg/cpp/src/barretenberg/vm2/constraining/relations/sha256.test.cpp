#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/sha256.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"
// Temporary imports, see comment in test.
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/sha256.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::ReturnRef;
using ::testing::StrictMock;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using sha256 = bb::avm2::sha256<FF>;

TEST(AvmConstrainingTest, Sha256PositiveEmptyRow)
{
    TestTraceContainer trace({
        { { C::precomputed_clk, 1 } },
    });

    check_relation<sha256>(trace.as_rows());
}

// This test imports a bunch of external code since hand-generating the sha256 trace is a bit laborious atm.
// The test is a bit of a placeholder for now.
// TOOD: Replace this with a hardcoded test vector and write a negative test
TEST(AvmConstrainingTest, Sha256Positive)
{
    simulation::NoopEventEmitter<simulation::MemoryEvent> emitter;
    simulation::Memory mem(/*space_id=*/0, emitter);
    StrictMock<simulation::MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(mem));

    simulation::EventEmitter<simulation::Sha256CompressionEvent> sha256_event_emitter;
    simulation::Sha256 sha256_gadget(sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, state[i], MemoryTag::U32);
    }

    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, input[i], MemoryTag::U32);
    }
    MemoryAddress dst_addr = 25;

    // We do two compression operations just to ensure the "after-latch" relations are correct
    sha256_gadget.compression(context, state_addr, input_addr, dst_addr);
    sha256_gadget.compression(context, state_addr, input_addr, dst_addr);
    TestTraceContainer trace;
    tracegen::Sha256TraceBuilder builder(trace);

    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container);

    TestTraceContainer::RowTraceContainer rows = trace.as_rows();

    check_relation<sha256>(rows);
}

} // namespace
} // namespace bb::avm2::constraining
