#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;

TEST(BitwiseTraceGenTest, U1And)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            {
                .operation = BitwiseOperation::AND,
                .a = MemoryValue::from(uint1_t(0)),
                .b = MemoryValue::from(uint1_t(1)),
                .res = 0,
            },
        },
        trace);

    EXPECT_EQ(trace.as_rows().size(), 1);

    EXPECT_THAT(trace.as_rows()[0],
                AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                      ROW_FIELD_EQ(bitwise_sel, 1),
                      ROW_FIELD_EQ(bitwise_sel_compute, 1),
                      ROW_FIELD_EQ(bitwise_sel_and, 1),
                      ROW_FIELD_EQ(bitwise_sel_u16, 0),
                      ROW_FIELD_EQ(bitwise_tag_byte_len, 1),
                      ROW_FIELD_EQ(bitwise_ia, 0),
                      ROW_FIELD_EQ(bitwise_ib, 1),
                      ROW_FIELD_EQ(bitwise_ic, 0),
                      ROW_FIELD_EQ(bitwise_ia_byte_0_, 0),
                      ROW_FIELD_EQ(bitwise_ib_byte_0_, 1),
                      ROW_FIELD_EQ(bitwise_output_and_0_, 0), // IC_BYTE_0 = output_and_0 = 0
                      ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::U1)),
                      ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::U1)),
                      ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::U1))));
}

TEST(BitwiseTraceGenTest, U32And)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            {
                .operation = BitwiseOperation::AND,
                .a = MemoryValue::from<uint32_t>(0x52488425),
                .b = MemoryValue::from<uint32_t>(0xC684486C),
                .res = 0x42000024,
            },
        },
        trace);

    EXPECT_EQ(trace.as_rows().size(), 1);

    EXPECT_THAT(trace.as_rows()[0],
                AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                      ROW_FIELD_EQ(bitwise_sel, 1),
                      ROW_FIELD_EQ(bitwise_sel_compute, 1),
                      ROW_FIELD_EQ(bitwise_sel_and, 1),
                      ROW_FIELD_EQ(bitwise_sel_u16, 1),
                      ROW_FIELD_EQ(bitwise_sel_u32, 1),
                      ROW_FIELD_EQ(bitwise_sel_u64, 0),
                      ROW_FIELD_EQ(bitwise_sel_u128, 0),
                      ROW_FIELD_EQ(bitwise_tag_byte_len, 4),
                      ROW_FIELD_EQ(bitwise_ia, 0x52488425),
                      ROW_FIELD_EQ(bitwise_ib, 0xC684486C),
                      ROW_FIELD_EQ(bitwise_ic, 0x42000024),
                      // Little-endian byte limbs of a, b and c.
                      ROW_FIELD_EQ(bitwise_ia_byte_0_, 0x25),
                      ROW_FIELD_EQ(bitwise_ia_byte_1_, 0x84),
                      ROW_FIELD_EQ(bitwise_ia_byte_2_, 0x48),
                      ROW_FIELD_EQ(bitwise_ia_byte_3_, 0x52),
                      ROW_FIELD_EQ(bitwise_ib_byte_0_, 0x6C),
                      ROW_FIELD_EQ(bitwise_ib_byte_1_, 0x48),
                      ROW_FIELD_EQ(bitwise_ib_byte_2_, 0x84),
                      ROW_FIELD_EQ(bitwise_ib_byte_3_, 0xC6),
                      // Per-limb AND outputs (IC_BYTE_i = output_and_i for an AND op).
                      ROW_FIELD_EQ(bitwise_output_and_0_, 0x24),
                      ROW_FIELD_EQ(bitwise_output_and_1_, 0x00),
                      ROW_FIELD_EQ(bitwise_output_and_2_, 0x00),
                      ROW_FIELD_EQ(bitwise_output_and_3_, 0x42),
                      // Inactive high-order limbs stay zero.
                      ROW_FIELD_EQ(bitwise_ia_byte_4_, 0),
                      ROW_FIELD_EQ(bitwise_output_and_15_, 0),
                      ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::U32)),
                      ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::U32)),
                      ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::U32))));
}

TEST(BitwiseTraceGenTest, ErrorInputFF)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(MemoryTag::FF, 1),
          .b = MemoryValue::from_tag(MemoryTag::FF, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    EXPECT_EQ(trace.as_rows().size(), 1);
    EXPECT_THAT(trace.as_rows()[0],
                AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                      ROW_FIELD_EQ(bitwise_sel, 1),
                      ROW_FIELD_EQ(bitwise_sel_compute, 0),
                      ROW_FIELD_EQ(bitwise_ia, 1),
                      ROW_FIELD_EQ(bitwise_ib, 1),
                      ROW_FIELD_EQ(bitwise_ic, 0),
                      ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::FF)),
                      ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::FF)),
                      ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::FF)),
                      ROW_FIELD_EQ(bitwise_sel_tag_ff_err, 1),
                      ROW_FIELD_EQ(bitwise_sel_tag_mismatch_err, 0),
                      ROW_FIELD_EQ(bitwise_err, 1),
                      ROW_FIELD_EQ(bitwise_tag_a_inv, 0)));
}

TEST(BitwiseTraceGenTest, ErrorTagMismatch)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(MemoryTag::U8, 1),
          .b = MemoryValue::from_tag(MemoryTag::U16, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    EXPECT_EQ(trace.as_rows().size(), 1);

    EXPECT_THAT(
        trace.as_rows()[0],
        AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
              ROW_FIELD_EQ(bitwise_sel, 1),
              ROW_FIELD_EQ(bitwise_sel_compute, 0),
              ROW_FIELD_EQ(bitwise_ia, 1),
              ROW_FIELD_EQ(bitwise_ib, 1),
              ROW_FIELD_EQ(bitwise_ic, 0),
              ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::U8)),
              ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::U16)),
              ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::FF)),
              // Err Flags
              ROW_FIELD_EQ(bitwise_sel_tag_ff_err, 0),
              ROW_FIELD_EQ(bitwise_sel_tag_mismatch_err, 1),
              ROW_FIELD_EQ(bitwise_err, 1),
              ROW_FIELD_EQ(bitwise_tag_ab_diff_inv,
                           FF(static_cast<uint8_t>(MemoryTag::U8) - static_cast<uint8_t>(MemoryTag::U16)).invert())));
}

TEST(BitwiseTraceGenTest, ErrorFFAndTagMismatch)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(MemoryTag::FF, 1),
          .b = MemoryValue::from_tag(MemoryTag::U16, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    EXPECT_EQ(trace.as_rows().size(), 1);

    EXPECT_THAT(
        trace.as_rows()[0],
        AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
              ROW_FIELD_EQ(bitwise_sel, 1),
              ROW_FIELD_EQ(bitwise_sel_compute, 0),
              ROW_FIELD_EQ(bitwise_ia, 1),
              ROW_FIELD_EQ(bitwise_ib, 1),
              ROW_FIELD_EQ(bitwise_ic, 0),
              ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::FF)),
              ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::U16)),
              ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::FF)),
              // Err Flags
              ROW_FIELD_EQ(bitwise_sel_tag_ff_err, 1),
              ROW_FIELD_EQ(bitwise_sel_tag_mismatch_err, 1),
              ROW_FIELD_EQ(bitwise_err, 1),
              ROW_FIELD_EQ(bitwise_tag_a_inv, 0),
              ROW_FIELD_EQ(
                  bitwise_tag_ab_diff_inv,
                  (FF(static_cast<uint8_t>(MemoryTag::FF)) - FF(static_cast<uint8_t>(MemoryTag::U16))).invert())));
}

} // namespace
} // namespace bb::avm2::tracegen
