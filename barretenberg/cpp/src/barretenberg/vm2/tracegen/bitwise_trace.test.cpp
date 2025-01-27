#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;
using FF = R::FF;

TEST(AvmTraceGenBitwiseTest, U1And)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            {
                .operation = BitwiseOperation::AND,
                .tag = MemoryTag::U1,
                .a = 0,
                .b = 1,
                .res = 0,
            },
        },
        trace);

    EXPECT_EQ(trace.as_rows().size(), 2);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 1),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 1),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 1),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, 1),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 1),
                                  ROW_FIELD_EQ(R, bitwise_start, 1)),
                            AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 0),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 0),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, 1),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 0),
                                  ROW_FIELD_EQ(R, bitwise_start, 0))));
}

TEST(AvmTraceGenBitwiseTest, U32And)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            {
                .operation = BitwiseOperation::AND,
                .tag = MemoryTag::U32,
                .a = 0x52488425,
                .b = 0xC684486C,
                .res = 0x42000024,
            },
        },
        trace);

    EXPECT_EQ(trace.as_rows().size(), 5);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0x52488425),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 0xC684486C),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0x42000024),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0x25),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 0x6C),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0x24),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 4),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, FF(4).invert()),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 1),
                                  ROW_FIELD_EQ(R, bitwise_start, 1)),
                            AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0x524884),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 0xC68448),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0x420000),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0x84),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 0x48),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0x00),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 3),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, FF(3).invert()),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 1),
                                  ROW_FIELD_EQ(R, bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0x5248),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 0xC684),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0x4200),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0x48),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 0x84),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0x00),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 2),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, FF(2).invert()),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 1),
                                  ROW_FIELD_EQ(R, bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0x52),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 0xC6),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0x42),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0x52),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 0xC6),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0x42),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 1),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, 1),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 1),
                                  ROW_FIELD_EQ(R, bitwise_start, 0)),
                            AllOf(ROW_FIELD_EQ(R, bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                                  ROW_FIELD_EQ(R, bitwise_acc_ia, 0),
                                  ROW_FIELD_EQ(R, bitwise_acc_ib, 0),
                                  ROW_FIELD_EQ(R, bitwise_acc_ic, 0),
                                  ROW_FIELD_EQ(R, bitwise_ia_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_ib_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_ic_byte, 0),
                                  ROW_FIELD_EQ(R, bitwise_tag, static_cast<int>(MemoryTag::U32)),
                                  ROW_FIELD_EQ(R, bitwise_ctr, 0),
                                  ROW_FIELD_EQ(R, bitwise_ctr_inv, 1),
                                  ROW_FIELD_EQ(R, bitwise_sel_bitwise, 0),
                                  ROW_FIELD_EQ(R, bitwise_start, 0))));
}

} // namespace
} // namespace bb::avm2::tracegen