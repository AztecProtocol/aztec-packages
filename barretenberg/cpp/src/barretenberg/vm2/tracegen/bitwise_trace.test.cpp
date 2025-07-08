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

    EXPECT_EQ(trace.as_rows().size(), 2);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(bitwise_op_id, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ctr, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                                  ROW_FIELD_EQ(bitwise_last, 1),
                                  ROW_FIELD_EQ(bitwise_sel, 0),
                                  ROW_FIELD_EQ(bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 1),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 1),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(bitwise_ctr, 1),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, 1),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 1),
                                  ROW_FIELD_EQ(bitwise_last, 1),
                                  ROW_FIELD_EQ(bitwise_sel, 1),
                                  ROW_FIELD_EQ(bitwise_sel_get_ctr, 1),
                                  ROW_FIELD_EQ(bitwise_start, 1))));
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

    EXPECT_EQ(trace.as_rows().size(), 5);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(bitwise_op_id, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ctr, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                                  ROW_FIELD_EQ(bitwise_last, 1),
                                  ROW_FIELD_EQ(bitwise_sel, 0),
                                  ROW_FIELD_EQ(bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0x52488425),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0xC684486C),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0x42000024),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0x25),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0x6C),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0x24),
                                  ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(bitwise_ctr, 4),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, FF(4).invert()),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, FF(3).invert()),
                                  ROW_FIELD_EQ(bitwise_last, 0),
                                  ROW_FIELD_EQ(bitwise_sel, 1),
                                  ROW_FIELD_EQ(bitwise_sel_get_ctr, 1),
                                  ROW_FIELD_EQ(bitwise_start, 1)),
                            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0x524884),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0xC68448),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0x420000),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0x84),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0x48),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0x00),
                                  ROW_FIELD_EQ(bitwise_tag_a, 0),
                                  ROW_FIELD_EQ(bitwise_tag_b, 0),
                                  ROW_FIELD_EQ(bitwise_tag_c, 0),
                                  ROW_FIELD_EQ(bitwise_ctr, 3),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, FF(3).invert()),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, FF(2).invert()),
                                  ROW_FIELD_EQ(bitwise_last, 0),
                                  ROW_FIELD_EQ(bitwise_sel, 1),
                                  ROW_FIELD_EQ(bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0x5248),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0xC684),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0x4200),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0x48),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0x84),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0x00),
                                  ROW_FIELD_EQ(bitwise_tag_a, 0),
                                  ROW_FIELD_EQ(bitwise_tag_b, 0),
                                  ROW_FIELD_EQ(bitwise_tag_c, 0),
                                  ROW_FIELD_EQ(bitwise_ctr, 2),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, FF(2).invert()),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 1),
                                  ROW_FIELD_EQ(bitwise_last, 0),
                                  ROW_FIELD_EQ(bitwise_sel, 1),
                                  ROW_FIELD_EQ(bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0x52),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0xC6),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0x42),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0x52),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0xC6),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0x42),
                                  ROW_FIELD_EQ(bitwise_tag_a, 0),
                                  ROW_FIELD_EQ(bitwise_tag_b, 0),
                                  ROW_FIELD_EQ(bitwise_tag_c, 0),
                                  ROW_FIELD_EQ(bitwise_ctr, 1),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, 1),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 1),
                                  ROW_FIELD_EQ(bitwise_last, 1),
                                  ROW_FIELD_EQ(bitwise_sel, 1),
                                  ROW_FIELD_EQ(bitwise_start, 0))));
}

TEST(BitwiseTraceGenTest, ErrorInputFF)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(ValueTag::FF, 1),
          .b = MemoryValue::from_tag(ValueTag::FF, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(bitwise_op_id, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 0),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(bitwise_ctr, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                                  ROW_FIELD_EQ(bitwise_last, 1),
                                  ROW_FIELD_EQ(bitwise_sel, 0)),
                            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(bitwise_acc_ia, 1),
                                  ROW_FIELD_EQ(bitwise_acc_ib, 1),
                                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(bitwise_ia_byte, 1),
                                  ROW_FIELD_EQ(bitwise_ib_byte, 1),
                                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(ValueTag::FF)),
                                  ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(ValueTag::FF)),
                                  ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(ValueTag::FF)),
                                  ROW_FIELD_EQ(bitwise_ctr, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                                  ROW_FIELD_EQ(bitwise_last, 1),
                                  // Err Flags
                                  ROW_FIELD_EQ(bitwise_sel_tag_ff_err, 1),
                                  ROW_FIELD_EQ(bitwise_sel_tag_mismatch_err, 0),
                                  ROW_FIELD_EQ(bitwise_err, 1),
                                  ROW_FIELD_EQ(bitwise_tag_a_inv, 0))));
}

TEST(BitwiseTraceGenTest, ErrorTagMismatch)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(ValueTag::U8, 1),
          .b = MemoryValue::from_tag(ValueTag::U16, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(ROW_FIELD_EQ(bitwise_op_id, 0),
                          ROW_FIELD_EQ(bitwise_acc_ia, 0),
                          ROW_FIELD_EQ(bitwise_acc_ib, 0),
                          ROW_FIELD_EQ(bitwise_acc_ic, 0),
                          ROW_FIELD_EQ(bitwise_ia_byte, 0),
                          ROW_FIELD_EQ(bitwise_ib_byte, 0),
                          ROW_FIELD_EQ(bitwise_ic_byte, 0),
                          ROW_FIELD_EQ(bitwise_ctr, 0),
                          ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                          ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                          ROW_FIELD_EQ(bitwise_last, 1),
                          ROW_FIELD_EQ(bitwise_sel, 0)),
                    AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                          ROW_FIELD_EQ(bitwise_acc_ia, 1),
                          ROW_FIELD_EQ(bitwise_acc_ib, 1),
                          ROW_FIELD_EQ(bitwise_acc_ic, 0),
                          ROW_FIELD_EQ(bitwise_ia_byte, 1),
                          ROW_FIELD_EQ(bitwise_ib_byte, 1),
                          ROW_FIELD_EQ(bitwise_ic_byte, 0),
                          ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(ValueTag::U8)),
                          ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(ValueTag::U16)),
                          ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(ValueTag::U8)),
                          ROW_FIELD_EQ(bitwise_ctr, 0),
                          ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                          ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                          ROW_FIELD_EQ(bitwise_last, 1),
                          // Err Flags
                          ROW_FIELD_EQ(bitwise_sel_tag_ff_err, 0),
                          ROW_FIELD_EQ(bitwise_sel_tag_mismatch_err, 1),
                          ROW_FIELD_EQ(bitwise_err, 1),
                          ROW_FIELD_EQ(
                              bitwise_tag_ab_diff_inv,
                              FF(static_cast<uint8_t>(ValueTag::U8) - static_cast<uint8_t>(ValueTag::U16)).invert()))));
}

TEST(BitwiseTraceGenTest, ErrorFFAndTagMismatch)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(ValueTag::FF, 1),
          .b = MemoryValue::from_tag(ValueTag::U16, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(bitwise_op_id, 0),
                  ROW_FIELD_EQ(bitwise_acc_ia, 0),
                  ROW_FIELD_EQ(bitwise_acc_ib, 0),
                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                  ROW_FIELD_EQ(bitwise_ia_byte, 0),
                  ROW_FIELD_EQ(bitwise_ib_byte, 0),
                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                  ROW_FIELD_EQ(bitwise_ctr, 0),
                  ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                  ROW_FIELD_EQ(bitwise_last, 1),
                  ROW_FIELD_EQ(bitwise_sel, 0)),
            AllOf(ROW_FIELD_EQ(bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                  ROW_FIELD_EQ(bitwise_acc_ia, 1),
                  ROW_FIELD_EQ(bitwise_acc_ib, 1),
                  ROW_FIELD_EQ(bitwise_acc_ic, 0),
                  ROW_FIELD_EQ(bitwise_ia_byte, 1),
                  ROW_FIELD_EQ(bitwise_ib_byte, 1),
                  ROW_FIELD_EQ(bitwise_ic_byte, 0),
                  ROW_FIELD_EQ(bitwise_tag_a, static_cast<int>(ValueTag::FF)),
                  ROW_FIELD_EQ(bitwise_tag_b, static_cast<int>(ValueTag::U16)),
                  ROW_FIELD_EQ(bitwise_tag_c, static_cast<int>(ValueTag::FF)),
                  ROW_FIELD_EQ(bitwise_ctr, 0),
                  ROW_FIELD_EQ(bitwise_ctr_inv, 0),
                  ROW_FIELD_EQ(bitwise_ctr_min_one_inv, 0),
                  ROW_FIELD_EQ(bitwise_last, 1),
                  // Err Flags
                  ROW_FIELD_EQ(bitwise_sel_tag_ff_err, 1),
                  ROW_FIELD_EQ(bitwise_sel_tag_mismatch_err, 1),
                  ROW_FIELD_EQ(bitwise_err, 1),
                  ROW_FIELD_EQ(bitwise_tag_a_inv, 0),
                  ROW_FIELD_EQ(
                      bitwise_tag_ab_diff_inv,
                      (FF(static_cast<uint8_t>(ValueTag::FF)) - FF(static_cast<uint8_t>(ValueTag::U16))).invert()))));
}

} // namespace
} // namespace bb::avm2::tracegen
