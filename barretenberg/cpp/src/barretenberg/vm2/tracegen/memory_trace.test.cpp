#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_memory.hpp"
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
            .value = MemoryValue::from_tag(MemoryTag::U8, 6),
            .space_id = 1001,
        },
        {
            .execution_clk = 20,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 5,
            .value = MemoryValue::from_tag(MemoryTag::U8, 3),
            .space_id = 1000,
        },
        {
            .execution_clk = UINT32_MAX,
            .mode = simulation::MemoryMode::READ,
            .addr = 20,
            .value = MemoryValue::from_tag(MemoryTag::U8, 5),
            .space_id = 1001,
        },
        {
            .execution_clk = 10,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 6,
            .value = MemoryValue::from_tag(MemoryTag::U8, 4),
            .space_id = 1000,
        },
        {
            .execution_clk = 20,
            .mode = simulation::MemoryMode::READ,
            .addr = 5,
            .value = MemoryValue::from_tag(MemoryTag::U8, 2),
            .space_id = 1000,
        },
        {
            .execution_clk = 15,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 5,
            .value = MemoryValue::from_tag(MemoryTag::U8, 1),
            .space_id = 1000,
        },
    };

    MemoryTraceBuilder memory_trace_builder;
    memory_trace_builder.process(events, trace);

    const auto& rows = trace.as_rows();

    // Add an empty row at the beginning.
    ASSERT_EQ(rows.size(), 7);

    for (uint32_t i = 0; i < trace.as_rows().size(); i++) {
        EXPECT_THAT(rows.at(i), ROW_FIELD_EQ(memory_value, i));
    }
}

TEST(MemoryTraceGenTest, MultipleEntries)
{
    TestTraceContainer trace;

    MemoryTraceBuilder memory_trace_builder;

    // The events are already sorted.
    // 1) WRITE: space_id = 1, addr = 10, clk = 1000, value = 1, tag = U1
    // 2) WRITE: space_id = 1, addr = 10, clk = 1001, value = 0, tag = U1
    // 3) READ: space_id = 1, addr = 11, clk = 1002, value = 0, tag = FF
    // 4) WRITE: space_id = 1, addr = 11, clk = 1002, value = 5, tag = U128
    // 5) WRITE: space_id = 2^16-1, addr = 11, clk = 1, value = 7, tag = U64
    // 6) WRITE: space_id = 2^16-1, addr = 11, clk = 2, value = 8, tag = U8
    // 7) WRITE: space_id = 2^16-1, addr = 12, clk = 3, value = 9, tag = U16
    // 8) WRITE: space_id = 2^16-1, addr = 12, clk = 4, value = 10, tag = U32
    // 9) READ: space_id = 2^16-1, addr = 12, clk = 4, value = 10, tag = U32
    // 10) READ: space_id = 2^16-1, addr = 12, clk = 4, value = 10, tag = U32
    std::vector<MemoryEvent> events = {
        {
            // 1) WRITE: space_id = 1, addr = 10, clk = 1000, value = 1, tag = U1
            .execution_clk = 1000,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 10,
            .value = MemoryValue::from_tag(MemoryTag::U1, 1),
            .space_id = 1,
        },
        {
            // 2) WRITE: space_id = 1, addr = 10, clk = 1001, value = 0, tag = U1
            .execution_clk = 1001,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 10,
            .value = MemoryValue::from_tag(MemoryTag::U1, 0),
            .space_id = 1,
        },
        {
            // 3) READ: space_id = 1, addr = 11, clk = 1002, value = 0, tag = FF
            .execution_clk = 1002,
            .mode = simulation::MemoryMode::READ,
            .addr = 11,
            .value = MemoryValue::from_tag(MemoryTag::FF, 0),
            .space_id = 1,
        },
        {
            // 4) WRITE: space_id = 1, addr = 11, clk = 1002, value = 5, tag = U128
            .execution_clk = 1002,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 11,
            .value = MemoryValue::from_tag(MemoryTag::U128, 5),
            .space_id = 1,
        },
        {
            // 5) WRITE: space_id = 2^16-1, addr = 11, clk = 1, value = 7, tag = U64
            .execution_clk = 1,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 11,
            .value = MemoryValue::from_tag(MemoryTag::U64, 7),
            .space_id = 0xFFFF,
        },
        {
            // 6) WRITE: space_id = 2^16-1, addr = 11, clk = 2, value = 8, tag = U8
            .execution_clk = 2,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 11,
            .value = MemoryValue::from_tag(MemoryTag::U8, 8),
            .space_id = 0xFFFF,
        },
        {
            // 7) WRITE: space_id = 2^16-1, addr = 12, clk = 3, value = 9, tag = U16
            .execution_clk = 3,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 12,
            .value = MemoryValue::from_tag(MemoryTag::U16, 9),
            .space_id = 0xFFFF,
        },
        {
            // 8) WRITE: space_id = 2^16-1, addr = 12, clk = 4, value = 10, tag = U32
            .execution_clk = 4,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 12,
            .value = MemoryValue::from_tag(MemoryTag::U32, 10),
            .space_id = 0xFFFF,
        },
        {
            // 9) READ: space_id = 2^16-1, addr = 12, clk = 9, value = 10, tag = U32
            .execution_clk = 9,
            .mode = simulation::MemoryMode::READ,
            .addr = 12,
            .value = MemoryValue::from_tag(MemoryTag::U32, 10),
            .space_id = 0xFFFF,
        },
        {
            // 10) READ: space_id = 2^16-1, addr = 12, clk = 9, value = 10, tag = U32
            .execution_clk = 9,
            .mode = simulation::MemoryMode::READ,
            .addr = 12,
            .value = MemoryValue::from_tag(MemoryTag::U32, 10),
            .space_id = 0xFFFF,
        },
    };

    memory_trace_builder.process(events, trace);

    const auto& rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 11);

    // 1) WRITE: space_id = 1, addr = 10, clk = 1000, value = 1, tag = U1
    EXPECT_THAT(
        rows.at(1),
        AllOf(ROW_FIELD_EQ(memory_sel, 1),
              ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
              ROW_FIELD_EQ(memory_sel_rng_chk, 1),
              ROW_FIELD_EQ(memory_sel_rng_write, 1),
              ROW_FIELD_EQ(memory_last_access, 0),
              ROW_FIELD_EQ(memory_space_id, 1),
              ROW_FIELD_EQ(memory_address, 10),
              ROW_FIELD_EQ(memory_clk, 1000),
              ROW_FIELD_EQ(memory_rw, 1),
              ROW_FIELD_EQ(memory_value, 1),
              ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U1)),
              ROW_FIELD_EQ(memory_global_addr, (1ULL << 32) + 10),
              ROW_FIELD_EQ(memory_timestamp, 2001),
              ROW_FIELD_EQ(memory_diff, 1), // (next timestamp - current timestamp - 1 (two writes)) 2003 - 2001 - 1
              ROW_FIELD_EQ(memory_limb_0_, 1),
              ROW_FIELD_EQ(memory_limb_1_, 0),
              ROW_FIELD_EQ(memory_limb_2_, 0),
              ROW_FIELD_EQ(memory_max_bits, 1)));

    // 2) WRITE: space_id = 1, addr = 10, clk = 1001, value = 0, tag = U1
    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 1),
                      ROW_FIELD_EQ(memory_space_id, 1),
                      ROW_FIELD_EQ(memory_address, 10),
                      ROW_FIELD_EQ(memory_clk, 1001),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 0),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U1)),
                      ROW_FIELD_EQ(memory_global_addr, (1ULL << 32) + 10),
                      ROW_FIELD_EQ(memory_timestamp, 2003),
                      ROW_FIELD_EQ(memory_diff, 1), // next address - current address (11 - 10)
                      ROW_FIELD_EQ(memory_limb_0_, 1),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 1)));

    // 3) READ: space_id = 1, addr = 11, clk = 1002, value = 0, tag = FF
    EXPECT_THAT(rows.at(3),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 1),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 0),
                      ROW_FIELD_EQ(memory_last_access, 0),
                      ROW_FIELD_EQ(memory_space_id, 1),
                      ROW_FIELD_EQ(memory_address, 11),
                      ROW_FIELD_EQ(memory_clk, 1002),
                      ROW_FIELD_EQ(memory_rw, 0),
                      ROW_FIELD_EQ(memory_value, 0),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::FF)),
                      ROW_FIELD_EQ(memory_global_addr, (1ULL << 32) + 11),
                      ROW_FIELD_EQ(memory_timestamp, 2004),
                      ROW_FIELD_EQ(memory_diff, 1), // next timestamp - current timestamp = 2005 - 2004 = 1
                      ROW_FIELD_EQ(memory_limb_0_, 1),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 0)));

    // 4) WRITE: space_id = 1, addr = 11, clk = 1002, value = 5, tag = U128
    EXPECT_THAT(rows.at(4),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 1),
                      ROW_FIELD_EQ(memory_space_id, 1),
                      ROW_FIELD_EQ(memory_address, 11),
                      ROW_FIELD_EQ(memory_clk, 1002),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 5),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U128)),
                      ROW_FIELD_EQ(memory_global_addr, (1ULL << 32) + 11),
                      ROW_FIELD_EQ(memory_timestamp, 2005),
                      ROW_FIELD_EQ(memory_diff, 0xFFFELLU << 32), // next address - current address = 2^32 *(2^16 - 2
                      ROW_FIELD_EQ(memory_limb_0_, 0),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0xFFFELLU),
                      ROW_FIELD_EQ(memory_max_bits, 128)));

    // 5) WRITE: space_id = 2^16-1, addr = 11, clk = 1, value = 7, tag = U64
    EXPECT_THAT(rows.at(5),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 0),
                      ROW_FIELD_EQ(memory_space_id, 0xFFFF),
                      ROW_FIELD_EQ(memory_address, 11),
                      ROW_FIELD_EQ(memory_clk, 1),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 7),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
                      ROW_FIELD_EQ(memory_global_addr, (0xFFFFULL << 32) + 11),
                      ROW_FIELD_EQ(memory_timestamp, 3),
                      ROW_FIELD_EQ(memory_diff, 1), // next timestamp - current timestamp = 5 - 3 - 1 (two writes)
                      ROW_FIELD_EQ(memory_limb_0_, 1),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 64)));

    // 6) WRITE: space_id = 2^16-1, addr = 11, clk = 2, value = 8, tag = U8
    EXPECT_THAT(rows.at(6),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 1),
                      ROW_FIELD_EQ(memory_space_id, 0xFFFF),
                      ROW_FIELD_EQ(memory_address, 11),
                      ROW_FIELD_EQ(memory_clk, 2),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 8),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U8)),
                      ROW_FIELD_EQ(memory_global_addr, (0xFFFFULL << 32) + 11),
                      ROW_FIELD_EQ(memory_timestamp, 5),
                      ROW_FIELD_EQ(memory_diff, 1), // next address - current address
                      ROW_FIELD_EQ(memory_limb_0_, 1),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 8)));

    // 7) WRITE: space_id = 2^16-1, addr = 12, clk = 3, value = 9, tag = U16
    EXPECT_THAT(rows.at(7),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 0),
                      ROW_FIELD_EQ(memory_space_id, 0xFFFF),
                      ROW_FIELD_EQ(memory_address, 12),
                      ROW_FIELD_EQ(memory_clk, 3),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 9),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U16)),
                      ROW_FIELD_EQ(memory_global_addr, (0xFFFFULL << 32) + 12),
                      ROW_FIELD_EQ(memory_timestamp, 7),
                      ROW_FIELD_EQ(memory_diff, 1), // next timestamp - current timestamp = 9 - 7 - 1
                      ROW_FIELD_EQ(memory_limb_0_, 1),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 16)));

    // 8) WRITE: space_id = 2^16-1, addr = 12, clk = 4, value = 10, tag = U32
    EXPECT_THAT(rows.at(8),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 0),
                      ROW_FIELD_EQ(memory_space_id, 0xFFFF),
                      ROW_FIELD_EQ(memory_address, 12),
                      ROW_FIELD_EQ(memory_clk, 4),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 10),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U32)),
                      ROW_FIELD_EQ(memory_global_addr, (0xFFFFULL << 32) + 12),
                      ROW_FIELD_EQ(memory_timestamp, 9),
                      ROW_FIELD_EQ(memory_diff, 9), // next timestamp - current timestamp = 18 - 9
                      ROW_FIELD_EQ(memory_limb_0_, 9),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 32)));

    // 9) READ: space_id = 2^16-1, addr = 12, clk = 9, value = 10, tag = U32
    EXPECT_THAT(rows.at(9),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 1),
                      ROW_FIELD_EQ(memory_sel_rng_write, 0),
                      ROW_FIELD_EQ(memory_last_access, 0),
                      ROW_FIELD_EQ(memory_space_id, 0xFFFF),
                      ROW_FIELD_EQ(memory_address, 12),
                      ROW_FIELD_EQ(memory_clk, 9),
                      ROW_FIELD_EQ(memory_rw, 0),
                      ROW_FIELD_EQ(memory_value, 10),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U32)),
                      ROW_FIELD_EQ(memory_global_addr, (0xFFFFULL << 32) + 12),
                      ROW_FIELD_EQ(memory_timestamp, 18),
                      ROW_FIELD_EQ(memory_diff, 0), // next timestamp - current timestamp = 18 - 18
                      ROW_FIELD_EQ(memory_limb_0_, 0),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 32)));

    // 10) READ: space_id = 2^16-1, addr = 12, clk = 9, value = 10, tag = U32
    EXPECT_THAT(rows.at(10),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 0),
                      ROW_FIELD_EQ(memory_sel_rng_write, 0),
                      ROW_FIELD_EQ(memory_last_access, 1),
                      ROW_FIELD_EQ(memory_space_id, 0xFFFF),
                      ROW_FIELD_EQ(memory_address, 12),
                      ROW_FIELD_EQ(memory_clk, 9),
                      ROW_FIELD_EQ(memory_rw, 0),
                      ROW_FIELD_EQ(memory_value, 10),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U32)),
                      ROW_FIELD_EQ(memory_global_addr, (0xFFFFULL << 32) + 12),
                      ROW_FIELD_EQ(memory_timestamp, 18),
                      ROW_FIELD_EQ(memory_diff, 0), // next timestamp - current timestamp = 18 - 0
                      ROW_FIELD_EQ(memory_limb_0_, 0),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 32)));
}

// Single memory entry
TEST(MemoryTraceGenTest, SingleEntry)
{
    TestTraceContainer trace;

    MemoryTraceBuilder memory_trace_builder;

    std::vector<MemoryEvent> events = {
        {
            .execution_clk = 137,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 10,
            .value = MemoryValue::from_tag(MemoryTag::U16, 12345),
            .space_id = 17,
        },
    };

    memory_trace_builder.process(events, trace);

    const auto& rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 2);

    // 1) WRITE: space_id = 17, addr = 10, clk = 137, value = 12345, tag = U16
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(memory_sel, 1),
                      ROW_FIELD_EQ(memory_sel_tag_is_ff, 0),
                      ROW_FIELD_EQ(memory_sel_rng_chk, 0),
                      ROW_FIELD_EQ(memory_sel_rng_write, 1),
                      ROW_FIELD_EQ(memory_last_access, 1),
                      ROW_FIELD_EQ(memory_space_id, 17),
                      ROW_FIELD_EQ(memory_address, 10),
                      ROW_FIELD_EQ(memory_clk, 137),
                      ROW_FIELD_EQ(memory_rw, 1),
                      ROW_FIELD_EQ(memory_value, 12345),
                      ROW_FIELD_EQ(memory_tag, static_cast<uint8_t>(MemoryTag::U16)),
                      ROW_FIELD_EQ(memory_global_addr, (17ULL << 32) + 10),
                      ROW_FIELD_EQ(memory_timestamp, 275),
                      ROW_FIELD_EQ(memory_diff, 0),
                      ROW_FIELD_EQ(memory_limb_0_, 0),
                      ROW_FIELD_EQ(memory_limb_1_, 0),
                      ROW_FIELD_EQ(memory_limb_2_, 0),
                      ROW_FIELD_EQ(memory_max_bits, 16)));
}

} // namespace
} // namespace bb::avm2::tracegen
