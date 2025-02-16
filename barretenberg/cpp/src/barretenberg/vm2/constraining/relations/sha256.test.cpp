#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/generated/relations/sha256.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
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

using simulation::EventEmitter;
using simulation::Memory;
using simulation::MemoryEvent;
using simulation::NoopEventEmitter;
using simulation::Sha256;
using simulation::Sha256CompressionEvent;

using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using sha256 = bb::avm2::sha256<FF>;
using tracegen::LookupIntoIndexedByClk;

using lookup_sha256_round_relation = bb::avm2::lookup_sha256_round_constant_relation<FF>;

TEST(Sha256Compression, EmptyRow)
{
    TestTraceContainer trace({
        { { C::precomputed_clk, 1 } },
    });

    check_relation<sha256>(trace);
}

// This test imports a bunch of external code since hand-generating the sha256 trace is a bit laborious atm.
// The test is a bit of a placeholder for now.
// TOOD: Replace this with a hardcoded test vector and write a negative test
TEST(Sha256Compression, Basic)
{
    NoopEventEmitter<MemoryEvent> emitter;
    Memory mem(/*space_id=*/0, emitter);
    StrictMock<simulation::MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(mem));

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(sha256_event_emitter);

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
    trace.set(C::precomputed_first_row, 0, 1);
    tracegen::Sha256TraceBuilder builder(trace);

    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container);

    check_relation<sha256>(trace);
}

TEST(Sha256Compression, Interaction)
{
    NoopEventEmitter<MemoryEvent> emitter;
    Memory mem(/*space_id=*/0, emitter);
    StrictMock<simulation::MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(mem));

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(sha256_event_emitter);

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

    sha256_gadget.compression(context, state_addr, input_addr, dst_addr);

    TestTraceContainer trace;
    tracegen::Sha256TraceBuilder builder(trace);
    tracegen::PrecomputedTraceBuilder precomputed_builder;
    // precomputed_builder.process_misc(trace);
    // Build just enough clk rows for the lookup
    trace.set(C::precomputed_first_row, 0, 1);
    for (uint32_t i = 0; i < 65; i++) {
        trace.set(C::precomputed_clk, i, i);
    }
    precomputed_builder.process_sha256_round_constants(trace);

    builder.process(sha256_event_emitter.get_events());
    LookupIntoIndexedByClk<lookup_sha256_round_relation::Settings>().process(trace);

    check_relation<sha256>(trace);
    check_interaction<lookup_sha256_round_relation>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
