#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::MemoryEvent;
using simulation::RangeCheckEvent;

using tracegen::MemoryTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using memory = bb::avm2::memory<FF>;

TEST(MemoryConstrainingTest, EmptyRow)
{
    check_relation<memory>(testing::empty_trace());
}

// Several memory events with trace generation.
TEST(MemoryConstrainingTest, MultipleEventsWithTraceGen)
{
    TestTraceContainer trace;
    MemoryTraceBuilder memory_trace_builder;
    PrecomputedTraceBuilder precomputed_trace_builder;
    RangeCheckTraceBuilder range_check_trace_builder;

    std::vector<MemoryEvent> mem_events = {
        // 1) READ: space_id = 17, addr = 120, clk = 13787, value = 0, tag = FF
        {
            .execution_clk = 13787,
            .mode = simulation::MemoryMode::READ,
            .addr = 120,
            .value = MemoryValue::from_tag(MemoryTag::FF, 0),
            .space_id = 17,
        },
        // 2) WRITE: space_id = 17, addr = 120, clk = 13787, value = 12345, tag = U16
        {
            .execution_clk = 13787,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 120,
            .value = MemoryValue::from_tag(MemoryTag::U16, 12345),
            .space_id = 17,
        },
        // 3) WRITE: space_id = 17, addr = 120, clk = 13788, value = 123, tag = U32
        {
            .execution_clk = 13788,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 120,
            .value = MemoryValue::from_tag(MemoryTag::U32, 123),
            .space_id = 17,
        },
        // 4) READ: space_id = 17, addr = 120, clk = 25000, value = 123, tag = U32
        {
            .execution_clk = 25000,
            .mode = simulation::MemoryMode::READ,
            .addr = 120,
            .value = MemoryValue::from_tag(MemoryTag::U32, 123),
            .space_id = 17,
        },
        // 5) WRITE: space_id = 17, addr = 121, clk = 45, value = 99999, tag = U128
        {
            .execution_clk = 45,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 121,
            .value = MemoryValue::from_tag(MemoryTag::U128, 99999),
            .space_id = 17,
        },
        // 6) READ: space_id = 17, addr = 121, clk = 49, value = 99999, tag = U128
        {
            .execution_clk = 49,
            .mode = simulation::MemoryMode::READ,
            .addr = 121,
            .value = MemoryValue::from_tag(MemoryTag::U128, 99999),
            .space_id = 17,
        },
        // 7) READ: space_id = 17, addr = 121, clk = 49, value = 99999, tag = U128
        {
            .execution_clk = 49,
            .mode = simulation::MemoryMode::READ,
            .addr = 121,
            .value = MemoryValue::from_tag(MemoryTag::U128, 99999),
            .space_id = 17,
        },
        // 8) READ: space_id = 17, addr = 121, clk = 765, value = 99999, tag = U128
        {
            .execution_clk = 765,
            .mode = simulation::MemoryMode::READ,
            .addr = 121,
            .value = MemoryValue::from_tag(MemoryTag::U128, 99999),
            .space_id = 17,
        },
        // 9) WRITE: space_id = 18, addr = 2, clk = 10, value = p-1, tag = FF
        {
            .execution_clk = 10,
            .mode = simulation::MemoryMode::WRITE,
            .addr = 2,
            .value = MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 1),
            .space_id = 18,
        },
    };

    // Range check event per non-FF memory write event.
    std::vector<RangeCheckEvent> range_check_events = {
        {
            .value = 12345,
            .num_bits = 16,
        },
        {
            .value = 123,
            .num_bits = 32,
        },
        {
            .value = 99999,
            .num_bits = 128,
        },
    };

    precomputed_trace_builder.process_sel_range_8(trace);
    precomputed_trace_builder.process_sel_range_16(trace);
    precomputed_trace_builder.process_misc(trace, 1 << 16);
    precomputed_trace_builder.process_tag_parameters(trace);
    range_check_trace_builder.process(range_check_events, trace);
    memory_trace_builder.process(mem_events, trace);

    // For the selector consistency, we need to make the read/write come from some trace.
    trace.visit_column(Column::memory_sel,
                       [&](uint32_t row, const FF&) { trace.set(Column::memory_sel_register_op_0_, row, 1); });

    check_relation<memory>(trace);
    check_all_interactions<MemoryTraceBuilder>(trace);
}

// Trace must be contiguous.
TEST(MemoryConstrainingTest, ContiguousTrace)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 }, { C::memory_sel, 0 } },
        { { C::memory_sel, 1 } },
        { { C::memory_sel, 1 } },
        { { C::memory_sel, 1 } },
        { { C::memory_sel, 0 } },
    });

    check_relation<memory>(trace, memory::SR_MEM_CONTIGUOUS);

    // Mutate the trace to make it non-contiguous.
    trace.set(C::memory_sel, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_MEM_CONTIGUOUS), "MEM_CONTIGUOUS");
}

// Boolean selector for range check is active at all active rows except the last one.
TEST(MemoryConstrainingTest, SelRngChk)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 }, { C::memory_sel_rng_chk, 1 } },
        { { C::memory_sel, 1 }, { C::memory_sel_rng_chk, 1 } },
        { { C::memory_sel, 1 }, { C::memory_sel_rng_chk, 0 } },
        { { C::memory_sel, 0 }, { C::memory_sel_rng_chk, 0 } },
    });

    check_relation<memory>(trace, memory::SR_SEL_RNG_CHK);

    // Disable the range check for the penultimate row.
    trace.set(C::memory_sel_rng_chk, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_SEL_RNG_CHK), "SEL_RNG_CHK");

    // Reset
    trace.set(C::memory_sel_rng_chk, 1, 1);

    // Disable the range check at the first row.
    trace.set(C::memory_sel_rng_chk, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_SEL_RNG_CHK), "SEL_RNG_CHK");

    // Reset
    trace.set(C::memory_sel_rng_chk, 0, 1);

    // Enable the range check at the last active row.
    trace.set(C::memory_sel_rng_chk, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_SEL_RNG_CHK), "SEL_RNG_CHK");
}

// Global address is derived from space_id and address.
TEST(MemoryConstrainingTest, GlobalAddr)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 },
          { C::memory_space_id, 12345 },
          { C::memory_address, 6789 },
          { C::memory_global_addr, (12345LLU << 32) + 6789 } },
        { { C::memory_sel, 1 },
          { C::memory_space_id, UINT16_MAX },
          { C::memory_address, UINT32_MAX },
          { C::memory_global_addr, UINT64_MAX >> 16 } },
        { { C::memory_sel, 1 },
          { C::memory_space_id, 0 },
          { C::memory_address, 987654321 },
          { C::memory_global_addr, 987654321 } },
        { { C::memory_sel, 1 },
          { C::memory_space_id, 1LLU << 12 },
          { C::memory_address, 0 },
          { C::memory_global_addr, 1LLU << 44 } },
    });

    check_relation<memory>(trace, memory::SR_GLOBAL_ADDR);

    // Mutate the trace to make the global address incorrect.
    trace.set(C::memory_global_addr, 1, trace.get(C::memory_global_addr, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_GLOBAL_ADDR), "GLOBAL_ADDR");

    // Reset
    trace.set(C::memory_global_addr, 1, trace.get(C::memory_global_addr, 1) - 1);
    check_relation<memory>(trace, memory::SR_GLOBAL_ADDR);

    // Mutate the trace to make the global address == address. (No space_id.)
    trace.set(C::memory_global_addr, 2, UINT32_MAX);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_GLOBAL_ADDR), "GLOBAL_ADDR");
}

// Timestamp is derived from clk and rw.
TEST(MemoryConstrainingTest, Timestamp)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 }, { C::memory_clk, 1 }, { C::memory_rw, 0 }, { C::memory_timestamp, 2 } },
        { { C::memory_sel, 1 }, { C::memory_clk, 2 }, { C::memory_rw, 1 }, { C::memory_timestamp, 5 } },
        { { C::memory_sel, 1 }, { C::memory_clk, 3 }, { C::memory_rw, 0 }, { C::memory_timestamp, 6 } },
        { { C::memory_sel, 1 },
          { C::memory_clk, UINT32_MAX },
          { C::memory_rw, 1 },
          { C::memory_timestamp, (1LLU << 33) - 1 } },
    });

    check_relation<memory>(trace, memory::SR_TIMESTAMP);

    // Mutate the trace to make the timestamp incorrect.
    trace.set(C::memory_timestamp, 1, trace.get(C::memory_timestamp, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_TIMESTAMP), "TIMESTAMP");

    // Reset
    trace.set(C::memory_timestamp, 1, trace.get(C::memory_timestamp, 1) - 1);
    check_relation<memory>(trace, memory::SR_TIMESTAMP);

    // Mutate the trace to make the timestamp == clk. (No rw.)
    trace.set(C::memory_timestamp, 3, UINT32_MAX);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_TIMESTAMP), "TIMESTAMP");
}

// last_access is derived from global_addr and global_addr'
TEST(MemoryConstrainingTest, LastAccess)
{
    TestTraceContainer trace({
        { { C::memory_sel_rng_chk, 1 },
          { C::memory_global_addr, 12345 },
          { C::memory_last_access, 1 },
          { C::memory_glob_addr_diff_inv, 1 } },
        { { C::memory_sel_rng_chk, 1 }, { C::memory_global_addr, 12346 }, { C::memory_last_access, 0 } },
        { { C::memory_sel_rng_chk, 1 }, { C::memory_global_addr, 12346 }, { C::memory_last_access, 0 } },
        { { C::memory_sel_rng_chk, 1 },
          { C::memory_global_addr, 12346 },
          { C::memory_last_access, 1 },
          { C::memory_glob_addr_diff_inv, 1 } },
        { { C::memory_sel_rng_chk, 0 },
          { C::memory_global_addr, 12347 },
          { C::memory_last_access, 1 },
          { C::memory_glob_addr_diff_inv, 1 } },
    });

    check_relation<memory>(trace, memory::SR_LAST_ACCESS);

    // Mutate the trace to make the last access incorrect (last_access == 0 instead of 1).
    trace.set(C::memory_last_access, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_LAST_ACCESS), "LAST_ACCESS");

    // Reset
    trace.set(C::memory_last_access, 0, 1);
    check_relation<memory>(trace, memory::SR_LAST_ACCESS);

    // Mutate glob_addr_diff_inv == 0.
    trace.set(C::memory_glob_addr_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_LAST_ACCESS), "LAST_ACCESS");

    // Reset
    trace.set(C::memory_glob_addr_diff_inv, 0, 1);
    check_relation<memory>(trace, memory::SR_LAST_ACCESS);

    // Mutate the trace to make the last access == 1, instead of 0.
    trace.set(C::memory_last_access, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_LAST_ACCESS), "LAST_ACCESS");
}

// diff is derived as global_addr' - global_addr when last_access == 1.
TEST(MemoryConstrainingTest, DiffWithLastAccess)
{
    // We set some dummy values for timestamp and rw to ensure that they do not interfer with diff derivation.
    TestTraceContainer trace({
        { { C::memory_sel_rng_chk, 1 },
          { C::memory_global_addr, 12345 },
          { C::memory_last_access, 1 },
          { C::memory_diff, 10000 },
          { C::memory_timestamp, 76 },
          { C::memory_rw, 1 } },
        { { C::memory_sel_rng_chk, 1 },
          { C::memory_global_addr, 22345 },
          { C::memory_last_access, 1 },
          { C::memory_diff, 12 },
          { C::memory_timestamp, 254 },
          { C::memory_rw, 1 } },
        { { C::memory_sel_rng_chk, 1 },
          { C::memory_global_addr, 22357 },
          { C::memory_last_access, 1 },
          { C::memory_diff, FF(-22357) },
          { C::memory_timestamp, 259 },
          { C::memory_rw, 1 } },
        { { C::memory_sel_rng_chk, 0 }, { C::memory_last_access, 0 } },
    });

    check_relation<memory>(trace, memory::SR_DIFF);

    // Mutate the trace to make the diff incorrect.
    trace.set(C::memory_diff, 1, trace.get(C::memory_diff, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_DIFF), "DIFF");
}

// diff is derived as timestamp' - timestamp - rw' * rw when last_access == 0.
TEST(MemoryConstrainingTest, DiffWithoutLastAccess)
{
    TestTraceContainer trace({
        { { C::memory_sel_rng_chk, 1 }, { C::memory_timestamp, 77 }, { C::memory_rw, 1 }, { C::memory_diff, 1 } },
        { { C::memory_sel_rng_chk, 1 }, { C::memory_timestamp, 79 }, { C::memory_rw, 1 }, { C::memory_diff, 8700 } },
        { { C::memory_sel_rng_chk, 1 }, { C::memory_timestamp, 8779 }, { C::memory_rw, 0 }, { C::memory_diff, 10000 } },
        { { C::memory_sel_rng_chk, 1 }, { C::memory_timestamp, 18779 }, { C::memory_rw, 0 }, { C::memory_diff, 2 } },
        { { C::memory_sel_rng_chk, 1 },
          { C::memory_timestamp, 18781 },
          { C::memory_rw, 1 },
          { C::memory_diff, FF(-18781) } },
        { { C::memory_sel_rng_chk, 0 }, { C::memory_last_access, 0 } },
    });

    check_relation<memory>(trace, memory::SR_DIFF);

    // Mutate the trace to make the diff incorrect.
    trace.set(C::memory_diff, 0, trace.get(C::memory_diff, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_DIFF), "DIFF");

    // Reset
    trace.set(C::memory_diff, 0, trace.get(C::memory_diff, 0) - 1);
    check_relation<memory>(trace, memory::SR_DIFF);

    // Mutate the trace to make the diff incorrect.
    trace.set(C::memory_diff, 1, trace.get(C::memory_diff, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_DIFF), "DIFF");
}

// diff correct decomposition into 3 16-bit limbs.
TEST(MemoryConstrainingTest, DiffDecomp)
{
    TestTraceContainer trace({
        { { C::memory_diff, 87 }, { C::memory_limb_0_, 87 }, { C::memory_limb_1_, 0 }, { C::memory_limb_2_, 0 } },
        { { C::memory_diff, 1ULL << 16 },
          { C::memory_limb_0_, 0 },
          { C::memory_limb_1_, 1 },
          { C::memory_limb_2_, 0 } },
        { { C::memory_diff, 1ULL << 32 },
          { C::memory_limb_0_, 0 },
          { C::memory_limb_1_, 0 },
          { C::memory_limb_2_, 1 } },
        { { C::memory_diff, UINT64_MAX >> 16 },
          { C::memory_limb_0_, UINT16_MAX },
          { C::memory_limb_1_, UINT16_MAX },
          { C::memory_limb_2_, UINT16_MAX } },
    });

    check_relation<memory>(trace, memory::SR_DIFF_DECOMP);

    // Mutate the trace to make the diff decomposition incorrect.
    trace.set(C::memory_limb_0_, 0, trace.get(C::memory_limb_0_, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_DIFF_DECOMP), "DIFF_DECOMP");

    // Reset
    trace.set(C::memory_limb_0_, 0, trace.get(C::memory_limb_0_, 0) - 1);
    check_relation<memory>(trace, memory::SR_DIFF_DECOMP);

    // Mutate the trace to make the diff decomposition incorrect.
    trace.set(C::memory_limb_1_, 1, trace.get(C::memory_limb_1_, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_DIFF_DECOMP), "DIFF_DECOMP");

    // Reset
    trace.set(C::memory_limb_1_, 1, trace.get(C::memory_limb_1_, 1) - 1);
    check_relation<memory>(trace, memory::SR_DIFF_DECOMP);

    // Mutate the trace to make the diff decomposition incorrect.
    trace.set(C::memory_limb_2_, 2, trace.get(C::memory_limb_2_, 2) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_DIFF_DECOMP), "DIFF_DECOMP");
}

// Correct memory value (and tag) initialization after first row.
TEST(MemoryConstrainingTest, MemoryInitValueFirstRow)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::memory_sel, 1 }, { C::memory_value, 0 }, { C::memory_tag, static_cast<uint8_t>(MemoryTag::FF) } },
    });

    check_relation<memory>(trace, memory::SR_MEMORY_INIT_VALUE, memory::SR_MEMORY_INIT_TAG);

    // Mutate the trace to make the memory value incorrect.
    trace.set(C::memory_value, 1, trace.get(C::memory_value, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_MEMORY_INIT_VALUE), "MEMORY_INIT_VALUE");

    // Reset
    trace.set(C::memory_value, 1, trace.get(C::memory_value, 1) - 1);
    check_relation<memory>(trace, memory::SR_MEMORY_INIT_VALUE, memory::SR_MEMORY_INIT_TAG);

    // Mutate the trace to make the memory tag incorrect.
    trace.set(C::memory_tag, 1, static_cast<uint8_t>(MemoryTag::U16));
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_MEMORY_INIT_TAG), "MEMORY_INIT_TAG");
}

// Correct memory value (and tag) initialization after last_access == 1.
TEST(MemoryConstrainingTest, MemoryInitValueLastAccess)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 }, { C::memory_last_access, 1 } },
        { { C::memory_sel, 1 }, { C::memory_value, 0 }, { C::memory_tag, static_cast<uint8_t>(MemoryTag::FF) } },
    });

    check_relation<memory>(trace, memory::SR_MEMORY_INIT_VALUE, memory::SR_MEMORY_INIT_TAG);

    // Mutate the trace to make the memory value incorrect.
    trace.set(C::memory_value, 1, trace.get(C::memory_value, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_MEMORY_INIT_VALUE), "MEMORY_INIT_VALUE");

    // Reset
    trace.set(C::memory_value, 1, trace.get(C::memory_value, 1) - 1);
    check_relation<memory>(trace, memory::SR_MEMORY_INIT_VALUE, memory::SR_MEMORY_INIT_TAG);

    // Mutate the trace to make the memory tag incorrect.
    trace.set(C::memory_tag, 1, static_cast<uint8_t>(MemoryTag::U1));
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_MEMORY_INIT_TAG), "MEMORY_INIT_TAG");
}

// Correct read-write consistency for memory value (and tag).
TEST(MemoryConstrainingTest, ReadWriteConsistency)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 },
          { C::memory_rw, 1 },
          { C::memory_value, 12 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U8) } }, // Write U8(12)
        { { C::memory_sel, 1 },
          { C::memory_rw, 0 },
          { C::memory_value, 12 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U8) } }, // Read U8(12)
        { { C::memory_sel, 1 },
          { C::memory_rw, 1 },
          { C::memory_value, 17 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U64) } }, // Write U64(17)
        { { C::memory_sel, 1 },
          { C::memory_rw, 1 },
          { C::memory_value, 12345 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U128) } }, // Write U128(12345)
        { { C::memory_sel, 1 },
          { C::memory_rw, 0 },
          { C::memory_value, 12345 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U128) } }, // Read U128(12345)
        { { C::memory_sel, 1 },
          { C::memory_last_access, 1 },
          { C::memory_rw, 0 },
          { C::memory_value, 12345 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U128) } }, // Read U128(12345)
    });

    check_relation<memory>(trace, memory::SR_READ_WRITE_CONSISTENCY_VALUE, memory::SR_READ_WRITE_CONSISTENCY_TAG);

    // Mutate the trace to make teh first read value (row 1) incorrect.
    trace.set(C::memory_value, 1, trace.get(C::memory_value, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_READ_WRITE_CONSISTENCY_VALUE),
                              "READ_WRITE_CONSISTENCY_VALUE");

    // Reset
    trace.set(C::memory_value, 1, trace.get(C::memory_value, 1) - 1);
    check_relation<memory>(trace, memory::SR_READ_WRITE_CONSISTENCY_VALUE, memory::SR_READ_WRITE_CONSISTENCY_TAG);

    // Mutate the trace to make the first read tag (row 1) incorrect.
    trace.set(C::memory_tag, 1, static_cast<uint8_t>(MemoryTag::U16));
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_READ_WRITE_CONSISTENCY_TAG),
                              "READ_WRITE_CONSISTENCY_TAG");
}

// Selector on tag == FF.
TEST(MemoryConstrainingTest, TagIsFF)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::FF) },
          { C::memory_sel_tag_is_ff, 1 } },
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U1) },
          { C::memory_sel_tag_is_ff, 0 },
          { C::memory_tag_ff_diff_inv,
            (FF(static_cast<uint8_t>(MemoryTag::U1)) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() } },
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U8) },
          { C::memory_sel_tag_is_ff, 0 },
          { C::memory_tag_ff_diff_inv,
            (FF(static_cast<uint8_t>(MemoryTag::U8)) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() } },
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U16) },
          { C::memory_sel_tag_is_ff, 0 },
          { C::memory_tag_ff_diff_inv,
            (FF(static_cast<uint8_t>(MemoryTag::U16)) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() } },
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
          { C::memory_sel_tag_is_ff, 0 },
          { C::memory_tag_ff_diff_inv,
            (FF(static_cast<uint8_t>(MemoryTag::U32)) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() } },
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U64) },
          { C::memory_sel_tag_is_ff, 0 },
          { C::memory_tag_ff_diff_inv,
            (FF(static_cast<uint8_t>(MemoryTag::U64)) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() } },
        { { C::memory_sel, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U128) },
          { C::memory_sel_tag_is_ff, 0 },
          { C::memory_tag_ff_diff_inv,
            (FF(static_cast<uint8_t>(MemoryTag::U128)) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() } },
    });

    check_relation<memory>(trace, memory::SR_TAG_IS_FF);

    // Attempt to de-activate sel_tag_is_ff when tag == FF.
    trace.set(C::memory_sel_tag_is_ff, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_TAG_IS_FF), "TAG_IS_FF");

    // Try to change value for diff_inv
    trace.set(C::memory_tag_ff_diff_inv, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_TAG_IS_FF), "TAG_IS_FF");

    // Reset
    trace.set(C::memory_sel_tag_is_ff, 0, 1);
    trace.set(C::memory_tag_ff_diff_inv, 0, 0);
    check_relation<memory>(trace, memory::SR_TAG_IS_FF);

    // Attempt to activate sel_tag_is_ff when tag != FF.
    trace.set(C::memory_sel_tag_is_ff, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_TAG_IS_FF), "TAG_IS_FF");

    // Try to modify value for tag_ff_diff_inv
    trace.set(C::memory_tag_ff_diff_inv, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<memory>(trace, memory::SR_TAG_IS_FF), "TAG_IS_FF");
}

// Boolean selector sel_rng_write is active for write operations and tag != FF.
TEST(MemoryConstrainingTest, SelRngWrite)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 }, { C::memory_rw, 1 }, { C::memory_sel_tag_is_ff, 1 }, { C::memory_sel_rng_write, 0 } },
        { { C::memory_sel, 1 }, { C::memory_rw, 1 }, { C::memory_sel_tag_is_ff, 0 }, { C::memory_sel_rng_write, 1 } },
        { { C::memory_sel, 1 }, { C::memory_rw, 0 }, { C::memory_sel_tag_is_ff, 1 }, { C::memory_sel_rng_write, 0 } },
        { { C::memory_sel, 1 }, { C::memory_rw, 0 }, { C::memory_sel_tag_is_ff, 0 }, { C::memory_sel_rng_write, 0 } },
    });

    check_relation<memory>(trace, memory::SR_SEL_RNG_WRITE);
}

// Negative test: attempts to write a value which is not present in the range check trace.
TEST(MemoryConstrainingTest, NegativeWriteValueOutOfRange)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 },
          { C::memory_rw, 1 },
          { C::memory_value, 12345 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U16) },
          { C::memory_sel_rng_write, 1 },
          { C::memory_max_bits, 128 },
          { C::range_check_sel, 1 },
          { C::range_check_value, 12345 },
          { C::range_check_rng_chk_bits, 128 } },
    });

    check_interaction<MemoryTraceBuilder, lookup_memory_range_check_write_tagged_value_settings>(trace);

    // Mutate the trace to make the value incorrect in range check.
    trace.set(C::range_check_value, 0, trace.get(C::range_check_value, 1) + 1);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<MemoryTraceBuilder, lookup_memory_range_check_write_tagged_value_settings>(trace)),
        "Failed.*RANGE_CHECK_WRITE_TAGGED_VALUE. Could not find tuple in destination.");
}

// Negative test: retrieve wrong max_bits value from precomputed table.
TEST(MemoryConstrainingTest, NegativeMaxBitsOutOfRange)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 },
          { C::memory_sel_rng_write, 1 },
          { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
          { C::memory_max_bits, 32 } },
    });

    PrecomputedTraceBuilder precomputed_trace_builder;
    precomputed_trace_builder.process_tag_parameters(trace);
    precomputed_trace_builder.process_misc(trace, 100); // 100 is an arbitrary upper bound for the number of tags.

    check_interaction<MemoryTraceBuilder, lookup_memory_tag_max_bits_settings>(trace);

    // Mutate the trace to make the max_bits incorrect.
    trace.set(C::memory_max_bits, 0, trace.get(C::memory_max_bits, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<MemoryTraceBuilder, lookup_memory_tag_max_bits_settings>(trace)),
                              "Failed.*LOOKUP_MEMORY_TAG_MAX_BITS. Could not find tuple in destination.");
}

// Negative test: limbs of diff cannot be larger than 16 bits.
TEST(MemoryConstrainingTest, NegativeDiffLimbOutOfRange)
{
    TestTraceContainer trace({
        { { C::memory_sel, 1 },
          { C::memory_sel_rng_chk, 1 },
          { C::memory_limb_0_, UINT16_MAX },
          { C::memory_limb_1_, UINT16_MAX },
          { C::memory_limb_2_, UINT16_MAX } },
    });

    PrecomputedTraceBuilder precomputed_trace_builder;
    precomputed_trace_builder.process_misc(trace, 1 << 16);
    precomputed_trace_builder.process_sel_range_16(trace);

    check_interaction<MemoryTraceBuilder,
                      lookup_memory_range_check_limb_0_settings,
                      lookup_memory_range_check_limb_1_settings,
                      lookup_memory_range_check_limb_2_settings>(trace);

    // Mutate the trace to make the limb_0 incorrect.
    trace.set(C::memory_limb_0_, 0, UINT16_MAX + 1);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<MemoryTraceBuilder, lookup_memory_range_check_limb_0_settings>(trace)),
                              "Failed.*RANGE_CHECK_LIMB_0. Could not find tuple in destination.");

    check_interaction<MemoryTraceBuilder, lookup_memory_range_check_limb_1_settings>(trace);

    // Mutate the trace to make the limb_1 incorrect.
    trace.set(C::memory_limb_1_, 0, UINT16_MAX + 1);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<MemoryTraceBuilder, lookup_memory_range_check_limb_1_settings>(trace)),
                              "Failed.*RANGE_CHECK_LIMB_1. Could not find tuple in destination.");

    check_interaction<MemoryTraceBuilder, lookup_memory_range_check_limb_2_settings>(trace);

    // Mutate the trace to make the limb_2 incorrect.
    trace.set(C::memory_limb_2_, 0, UINT16_MAX + 1);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<MemoryTraceBuilder, lookup_memory_range_check_limb_2_settings>(trace)),
                              "Failed.*RANGE_CHECK_LIMB_2. Could not find tuple in destination.");
}

} // namespace
} // namespace bb::avm2::constraining
