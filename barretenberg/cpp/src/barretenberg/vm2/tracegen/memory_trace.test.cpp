#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using R = TestTraceContainer::Row;
using C = Column;
using simulation::MemoryEvent;

TEST(MemoryTraceGenTest, Sorting)
{
    TestTraceContainer trace;

    // We use .value field to check that the events are sorted correctly. The values
    // are set to be in increasing order once the events are sorted.
    std::vector<MemoryEvent> events = {
        {
            .execution_clk = UINT32_MAX,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 20,
            .value = MemoryValue::from_tag(MemoryTag::U8, 5),
            .space_id = 1001,
        },
        {
            .execution_clk = 20,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 5,
            .value = MemoryValue::from_tag(MemoryTag::U8, 2),
            .space_id = 1000,
        },
        {
            .execution_clk = UINT32_MAX,
            .mode = simulation::MemoryMode::READ,
            .addr = 20,
            .value = MemoryValue::from_tag(MemoryTag::U8, 4),
            .space_id = 1001,
        },
        {
            .execution_clk = 10,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 6,
            .value = MemoryValue::from_tag(MemoryTag::U8, 3),
            .space_id = 1000,
        },
        {
            .execution_clk = 20,
            .mode = simulation::MemoryMode::READ,
            .addr = 5,
            .value = MemoryValue::from_tag(MemoryTag::U8, 1),
            .space_id = 1000,
        },
        {
            .execution_clk = 15,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 5,
            .value = MemoryValue::from_tag(MemoryTag::U8, 0),
            .space_id = 1000,
        },
    };

    MemoryTraceBuilder memory_trace_builder;
    memory_trace_builder.process(events, trace);

    const auto& rows = trace.as_rows();

    ASSERT_EQ(rows.size(), 6);

    for (uint32_t i = 0; i < trace.as_rows().size(); i++) {
        EXPECT_THAT(rows.at(i), ROW_FIELD_EQ(memory_value, i));
    }
}

} // namespace
} // namespace bb::avm2::tracegen
