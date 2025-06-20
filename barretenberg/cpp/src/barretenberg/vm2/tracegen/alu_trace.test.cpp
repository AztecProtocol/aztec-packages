#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::AluOperation;
using testing::ElementsAre;

using R = TestTraceContainer::Row;

TEST(AluTraceGenTest, TraceGenerationBasicAddU32)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint32_t>(1),
              .b = MemoryValue::from<uint32_t>(2),
              .c = MemoryValue::from<uint32_t>(3) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            // Only one row.
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id,
                               static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id)),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 3),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U32)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U32)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U32)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_is_u1, 0),
                  ROW_FIELD_EQ(alu_max_bits, 32),
                  ROW_FIELD_EQ(alu_max_value, uint256_t(1) << 32),
                  ROW_FIELD_EQ(alu_tag_m1_inv, FF(static_cast<uint8_t>(ValueTag::U32) - 1).invert()))));
}

TEST(AluTraceGenTest, TraceGenerationAddU1)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint1_t>(1),
              .b = MemoryValue::from<uint1_t>(0),
              .c = MemoryValue::from<uint1_t>(1) },
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint1_t>(1),
              .b = MemoryValue::from<uint1_t>(1),
              .c = MemoryValue::from<uint1_t>(0) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id,
                               static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id)),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 0),
                  ROW_FIELD_EQ(alu_ic, 1),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_is_u1, 1),
                  ROW_FIELD_EQ(alu_max_bits, 1),
                  ROW_FIELD_EQ(alu_max_value, 2),
                  ROW_FIELD_EQ(alu_tag_m1_inv, 0)),
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id,
                               static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id)),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 1),
                  ROW_FIELD_EQ(alu_ic, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 1),
                  ROW_FIELD_EQ(alu_is_u1, 1),
                  ROW_FIELD_EQ(alu_max_bits, 1),
                  ROW_FIELD_EQ(alu_max_value, 2),
                  ROW_FIELD_EQ(alu_tag_m1_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationAddU128)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    // TODO(MW): cleanup this type mess:
    auto a_max = static_cast<uint128_t>((static_cast<uint256_t>(1) << 128) - 1);

    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint128_t>(3) },
            { .operation = AluOperation::ADD,

              .a = MemoryValue::from<uint128_t>(a_max),
              .b = MemoryValue::from<uint128_t>(4),
              .c = MemoryValue::from<uint128_t>(3) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id,
                               static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id)),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 3),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_is_u1, 0),
                  ROW_FIELD_EQ(alu_max_bits, 128),
                  ROW_FIELD_EQ(alu_max_value, uint256_t(1) << 128),
                  ROW_FIELD_EQ(alu_tag_m1_inv, FF(static_cast<uint8_t>(ValueTag::U128) - 1).invert())),
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id,
                               static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id)),
                  ROW_FIELD_EQ(alu_ia, a_max),
                  ROW_FIELD_EQ(alu_ib, 4),
                  ROW_FIELD_EQ(alu_ic, 3),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_cf, 1),
                  ROW_FIELD_EQ(alu_is_u1, 0),
                  ROW_FIELD_EQ(alu_max_bits, 128),
                  ROW_FIELD_EQ(alu_max_value, uint256_t(1) << 128),
                  ROW_FIELD_EQ(alu_tag_m1_inv, FF(static_cast<uint8_t>(ValueTag::U128) - 1).invert()))));
}

} // namespace
} // namespace bb::avm2::tracegen
