#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <tuple>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::Alu;
using simulation::AluError;
using simulation::AluEvent;
using simulation::AluOperation;
using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MockFieldGreaterThan;
using simulation::MockGreaterThan;
using simulation::MockRangeCheck;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using testing::ElementsAre;
using testing::StrictMock;

using R = TestTraceContainer::Row;

// TODO(MW): Add TEST_P for ADD, MUL, LT, LTE
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

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                          ROW_FIELD_EQ(alu_ia, 1),
                          ROW_FIELD_EQ(alu_ib, 2),
                          ROW_FIELD_EQ(alu_ic, 3),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U32)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U32)),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U32)),
                          ROW_FIELD_EQ(alu_cf, 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U32)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U32)),
                          ROW_FIELD_EQ(alu_sel_is_ff, 0),
                          ROW_FIELD_EQ(alu_sel_tag_err, 0),
                          ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
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

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, 0),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, 1),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationAddU128)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint128_t>(3) },
            { .operation = AluOperation::ADD,

              .a = MemoryValue::from<uint128_t>(u128_max),
              .b = MemoryValue::from<uint128_t>(4),
              .c = MemoryValue::from<uint128_t>(3) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, 2),
                                  ROW_FIELD_EQ(alu_ic, 3),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                                  ROW_FIELD_EQ(alu_ia, u128_max),
                                  ROW_FIELD_EQ(alu_ib, 4),
                                  ROW_FIELD_EQ(alu_ic, 3),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationAddTagError)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint64_t>(2),
              .c = MemoryValue::from<uint128_t>(3),
              .error = AluError::TAG_ERROR },
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint64_t>(3) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                          ROW_FIELD_EQ(alu_ia, 1),
                          ROW_FIELD_EQ(alu_ib, 2),
                          ROW_FIELD_EQ(alu_ic, 3),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U64)),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_cf, 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_sel_is_ff, 0),
                          ROW_FIELD_EQ(alu_sel_tag_err, 1),
                          ROW_FIELD_EQ(
                              alu_ab_tags_diff_inv,
                              FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::U64)).invert())),
                    AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                          ROW_FIELD_EQ(alu_ia, 1),
                          ROW_FIELD_EQ(alu_ib, 2),
                          ROW_FIELD_EQ(alu_ic, 3),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U64)),
                          ROW_FIELD_EQ(alu_cf, 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_sel_is_ff, 0),
                          ROW_FIELD_EQ(alu_sel_tag_err,
                                       0)) // Incorrect c tag does not create a tag error (see C_TAG_CHECK)
                    ));
}

TEST(AluTraceGenTest, TraceGenerationSub)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint64_t u64_max = static_cast<uint64_t>(get_tag_max_value(ValueTag::U64));
    builder.process(
        {
            { .operation = AluOperation::SUB,
              .a = MemoryValue::from<FF>(3),
              .b = MemoryValue::from<FF>(2),
              .c = MemoryValue::from<FF>(1) },
            { .operation = AluOperation::SUB,
              .a = MemoryValue::from<uint64_t>(1),
              .b = MemoryValue::from<uint64_t>(u64_max),
              .c = MemoryValue::from<uint64_t>(2) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                                  ROW_FIELD_EQ(alu_ia, 3),
                                  ROW_FIELD_EQ(alu_ib, 2),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, FF::modulus - 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, u64_max),
                                  ROW_FIELD_EQ(alu_ic, 2),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U64)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U64)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U64)),
                                  ROW_FIELD_EQ(alu_cf, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U64)),
                                  ROW_FIELD_EQ(alu_max_value, u64_max),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationSubU128)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    builder.process(
        {
            { .operation = AluOperation::SUB,
              .a = MemoryValue::from<uint128_t>(3),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint128_t>(1) },
            { .operation = AluOperation::SUB,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(u128_max),
              .c = MemoryValue::from<uint128_t>(2) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                                  ROW_FIELD_EQ(alu_ia, 3),
                                  ROW_FIELD_EQ(alu_ib, 2),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, u128_max),
                                  ROW_FIELD_EQ(alu_ic, 2),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationSubTagError)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::SUB,
              .a = MemoryValue::from<uint128_t>(3),
              .b = MemoryValue::from<uint64_t>(2),
              .c = MemoryValue::from<uint128_t>(1),
              .error = AluError::TAG_ERROR },
            { .operation = AluOperation::SUB,
              .a = MemoryValue::from<uint128_t>(4),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint64_t>(2) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                          ROW_FIELD_EQ(alu_ia, 3),
                          ROW_FIELD_EQ(alu_ib, 2),
                          ROW_FIELD_EQ(alu_ic, 1),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U64)),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_cf, 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_sel_tag_err, 1),
                          ROW_FIELD_EQ(
                              alu_ab_tags_diff_inv,
                              FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::U64)).invert())),
                    AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                          ROW_FIELD_EQ(alu_ia, 4),
                          ROW_FIELD_EQ(alu_ib, 2),
                          ROW_FIELD_EQ(alu_ic, 2),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U64)),
                          ROW_FIELD_EQ(alu_cf, 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U128)),
                          ROW_FIELD_EQ(alu_sel_tag_err,
                                       0)) // Incorrect c tag does not create a tag error (see C_TAG_CHECK)
                    ));
}

TEST(AluTraceGenTest, TraceGenerationMul)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint64_t u64_max = static_cast<uint64_t>(get_tag_max_value(ValueTag::U64));
    builder.process(
        {
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<FF>(FF::modulus - 2),
              .b = MemoryValue::from<FF>(3),
              .c = MemoryValue::from<FF>(FF::modulus - 6) },
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint64_t>(u64_max),
              .b = MemoryValue::from<uint64_t>(2),
              .c = MemoryValue::from<uint64_t>(u64_max - 1) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                  ROW_FIELD_EQ(alu_ia, FF::modulus - 2),
                  ROW_FIELD_EQ(alu_ib, 3),
                  ROW_FIELD_EQ(alu_ic, FF::modulus - 6),
                  ROW_FIELD_EQ(alu_c_hi, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::FF)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                  ROW_FIELD_EQ(alu_max_value, FF::modulus - 1),
                  ROW_FIELD_EQ(alu_constant_64, 64),
                  ROW_FIELD_EQ(alu_sel_is_u128, 0),
                  ROW_FIELD_EQ(alu_tag_u128_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::FF) - static_cast<uint8_t>(ValueTag::U128)).invert()),
                  ROW_FIELD_EQ(alu_sel_mul_u128, 0),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
            AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                  ROW_FIELD_EQ(alu_ia, u64_max),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, u64_max - 1),
                  ROW_FIELD_EQ(alu_c_hi, 1),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_max_value, u64_max),
                  ROW_FIELD_EQ(alu_sel_is_u128, 0),
                  ROW_FIELD_EQ(alu_tag_u128_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U64) - static_cast<uint8_t>(ValueTag::U128)).invert()),
                  ROW_FIELD_EQ(alu_sel_mul_u128, 0),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationMulU128)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    builder.process(
        {
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint128_t>(2),
              .b = MemoryValue::from<uint128_t>(3),
              .c = MemoryValue::from<uint128_t>(6) },
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint128_t>(u128_max),
              .b = MemoryValue::from<uint128_t>(u128_max - 2),
              .c = MemoryValue::from<uint128_t>(3) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                                  ROW_FIELD_EQ(alu_ia, 2),
                                  ROW_FIELD_EQ(alu_a_hi, 0),
                                  ROW_FIELD_EQ(alu_a_lo, 2),
                                  ROW_FIELD_EQ(alu_ib, 3),
                                  ROW_FIELD_EQ(alu_b_hi, 0),
                                  ROW_FIELD_EQ(alu_b_lo, 3),
                                  ROW_FIELD_EQ(alu_ic, 6),
                                  ROW_FIELD_EQ(alu_c_hi, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_constant_64, 64),
                                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                                  ROW_FIELD_EQ(alu_tag_u128_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_mul_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                                  ROW_FIELD_EQ(alu_ia, u128_max),
                                  ROW_FIELD_EQ(alu_a_hi, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_a_lo, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_ib, u128_max - 2),
                                  ROW_FIELD_EQ(alu_b_hi, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_b_lo, (uint256_t(1) << 64) - 3),
                                  ROW_FIELD_EQ(alu_ic, 3),
                                  ROW_FIELD_EQ(alu_c_hi, (uint256_t(1) << 64) - 5),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                                  ROW_FIELD_EQ(alu_tag_u128_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_mul_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationMulTagError)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint128_t>(2),
              .b = MemoryValue::from<uint64_t>(3),
              .c = MemoryValue::from<uint128_t>(6),
              .error = AluError::TAG_ERROR },
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint64_t>(2) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                  ROW_FIELD_EQ(alu_ia, 2),
                  ROW_FIELD_EQ(alu_ib, 3),
                  ROW_FIELD_EQ(alu_ic, 6),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                  ROW_FIELD_EQ(alu_sel_tag_err, 1),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::U64)).invert()),
                  ROW_FIELD_EQ(alu_sel_mul_u128, 1)),
            AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 2),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                  ROW_FIELD_EQ(alu_sel_mul_u128, 1),
                  ROW_FIELD_EQ(alu_sel_tag_err,
                               0)) // Incorrect c tag does not create a tag error (see C_TAG_CHECK)
            ));
}

TEST(AluTraceGenTest, TraceGenerationLTU128)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    builder.process(
        {
            { .operation = AluOperation::LT,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint1_t>(1) },
            { .operation = AluOperation::LT,
              .a = MemoryValue::from<uint128_t>(u128_max),
              .b = MemoryValue::from<uint128_t>(4),
              .c = MemoryValue::from<uint1_t>(0) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 1),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, 2),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, 1),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, 1),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 1),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
            AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                  ROW_FIELD_EQ(alu_ia, u128_max),
                  ROW_FIELD_EQ(alu_ib, 4),
                  ROW_FIELD_EQ(alu_ic, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, 4),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, u128_max),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 1),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationLTFF)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::LT,
              .a = MemoryValue::from<FF>(1),
              .b = MemoryValue::from<FF>(2),
              .c = MemoryValue::from<uint1_t>(1) },
            { .operation = AluOperation::LT,
              .a = MemoryValue::from<FF>(FF::modulus - 3),
              .b = MemoryValue::from<FF>(4),
              .c = MemoryValue::from<uint1_t>(0) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, 2),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_lt_ops_input_a, 2),
                                  ROW_FIELD_EQ(alu_lt_ops_input_b, 1),
                                  ROW_FIELD_EQ(alu_lt_ops_result_c, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1),
                                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
                                  ROW_FIELD_EQ(alu_tag_ff_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                                  ROW_FIELD_EQ(alu_ia, FF::modulus - 3),
                                  ROW_FIELD_EQ(alu_ib, 4),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_lt_ops_input_a, 4),
                                  ROW_FIELD_EQ(alu_lt_ops_input_b, FF::modulus - 3),
                                  ROW_FIELD_EQ(alu_lt_ops_result_c, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1),
                                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
                                  ROW_FIELD_EQ(alu_tag_ff_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationLTEFF)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::LTE,
              .a = MemoryValue::from<FF>(1),
              .b = MemoryValue::from<FF>(2),
              .c = MemoryValue::from<uint1_t>(1) },
            { .operation = AluOperation::LTE,
              .a = MemoryValue::from<FF>(FF::modulus - 3),
              .b = MemoryValue::from<FF>(4),
              .c = MemoryValue::from<uint1_t>(0) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, 2),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_lt_ops_input_a, 1),
                                  ROW_FIELD_EQ(alu_lt_ops_input_b, 2),
                                  ROW_FIELD_EQ(alu_lt_ops_result_c, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1),
                                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
                                  ROW_FIELD_EQ(alu_tag_ff_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                                  ROW_FIELD_EQ(alu_ia, FF::modulus - 3),
                                  ROW_FIELD_EQ(alu_ib, 4),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_lt_ops_input_a, FF::modulus - 3),
                                  ROW_FIELD_EQ(alu_lt_ops_input_b, 4),
                                  ROW_FIELD_EQ(alu_lt_ops_result_c, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1),
                                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 1),
                                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
                                  ROW_FIELD_EQ(alu_tag_ff_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationLTEU128)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    builder.process(
        {
            { .operation = AluOperation::LTE,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint1_t>(1) },
            { .operation = AluOperation::LTE,
              .a = MemoryValue::from<uint128_t>(u128_max),
              .b = MemoryValue::from<uint128_t>(4),
              .c = MemoryValue::from<uint1_t>(0) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 1),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, 1),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, 2),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 1),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
            AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                  ROW_FIELD_EQ(alu_ia, u128_max),
                  ROW_FIELD_EQ(alu_ib, 4),
                  ROW_FIELD_EQ(alu_ic, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, u128_max),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, 4),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, 1),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 1),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST(AluTraceGenTest, TraceGenerationLTEU128TagError)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    builder.process(
        {
            { .operation = AluOperation::LTE,
              .a = MemoryValue::from<uint128_t>(2),
              .b = MemoryValue::from<uint64_t>(1),
              .c = MemoryValue::from<uint1_t>(0),
              .error = AluError::TAG_ERROR },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            // Only one row.
            AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 0), // This is set to 0 due to the tag error
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                  ROW_FIELD_EQ(alu_ia, 2),
                  ROW_FIELD_EQ(alu_ib, 1),
                  ROW_FIELD_EQ(alu_ic, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U64)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, 2),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, 1),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, 0), // This is set to 0 due to the tag error
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_tag_err, 1),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::U64)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 1))));
}

// EQ TESTS

// Generic structure for three-operand opcodes
struct ThreeOperandTestParams {
    MemoryValue a;
    MemoryValue b;
    MemoryValue c;
};

TestTraceContainer process_eq_trace(const ThreeOperandTestParams& params, bool error = false)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::EQ,
              .a = params.a,
              .b = params.b,
              .c = params.c,
              .error = error ? std::make_optional(AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    return trace;
}

// Parametrized test for EQ operations with same values and tags
class EQTraceSameValuesAndTagsTest : public ::testing::TestWithParam<MemoryValue> {};

TEST_P(EQTraceSameValuesAndTagsTest, Basic)
{
    const MemoryValue& param = GetParam();
    auto trace = process_eq_trace(ThreeOperandTestParams{ .a = param, .b = param, .c = MemoryValue::from<uint1_t>(1) });

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, param.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, param.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_helper1, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(param.get_tag())),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(param.get_tag())),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// Test parameters: MemoryValue a
INSTANTIATE_TEST_SUITE_P(AluTraceGenTest,
                         EQTraceSameValuesAndTagsTest,
                         ::testing::Values(MemoryValue::from<uint1_t>(1),
                                           MemoryValue::from<uint8_t>(42),
                                           MemoryValue::from<uint16_t>(12345),
                                           MemoryValue::from<uint32_t>(123456789),
                                           MemoryValue::from<uint64_t>(1234567890123456789ULL),
                                           MemoryValue::from<uint128_t>(123456789),
                                           MemoryValue::from<FF>(42)));

class EQTraceInequalityTest : public ::testing::TestWithParam<ThreeOperandTestParams> {};

TEST_P(EQTraceInequalityTest, Basic)
{
    auto params = GetParam();
    auto trace = process_eq_trace(params);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, params.b.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_helper1, FF(params.a.as_ff() - params.b.as_ff()).invert()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.a.get_tag())),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(params.b.get_tag())),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

const std::vector<ThreeOperandTestParams> EQ_INEQUALITY_TEST_PARAMS = {
    {
        .a = MemoryValue::from<uint1_t>(1),
        .b = MemoryValue::from<uint1_t>(0),
        .c = MemoryValue::from<uint1_t>(0),
    },
    {
        .a = MemoryValue::from<uint8_t>(42),
        .b = MemoryValue::from<uint8_t>(24),
        .c = MemoryValue::from<uint1_t>(0),
    },
    {
        .a = MemoryValue::from<uint16_t>(12345),
        .b = MemoryValue::from<uint16_t>(54321),
        .c = MemoryValue::from<uint1_t>(0),
    },
    {
        .a = MemoryValue::from<uint32_t>(123456789),
        .b = MemoryValue::from<uint32_t>(987654321),
        .c = MemoryValue::from<uint1_t>(0),
    },
    {
        .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
        .b = MemoryValue::from<uint64_t>(9876543210987654321ULL),
        .c = MemoryValue::from<uint1_t>(0),
    },
    {
        .a = MemoryValue::from<uint128_t>(123456789),
        .b = MemoryValue::from<uint128_t>(987654321),
        .c = MemoryValue::from<uint1_t>(0),
    },
    {
        .a = MemoryValue::from<FF>(FF::modulus - 3),
        .b = MemoryValue::from<FF>(FF::modulus - 1),
        .c = MemoryValue::from<uint1_t>(0),
    }
};

// Test parameters for inequality: (MemoryValue a, MemoryValue b) - values are different
INSTANTIATE_TEST_SUITE_P(AluTraceGenTest, EQTraceInequalityTest, ::testing::ValuesIn(EQ_INEQUALITY_TEST_PARAMS));

// Parametrized test for EQ operations with different value tags (tag error case)
class EQTraceTagErrorTest : public ::testing::TestWithParam<ThreeOperandTestParams> {};

TEST_P(EQTraceTagErrorTest, Basic)
{
    auto params = GetParam();
    auto trace = process_eq_trace(params, true);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_eq, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
            ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
            ROW_FIELD_EQ(alu_ib, params.b.as_ff()),
            ROW_FIELD_EQ(alu_ic, 0),
            ROW_FIELD_EQ(alu_helper1, 0),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.a.get_tag())),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(params.b.get_tag())),
            ROW_FIELD_EQ(alu_ic_tag, 0),
            ROW_FIELD_EQ(alu_sel_tag_err, 1),
            ROW_FIELD_EQ(
                alu_ab_tags_diff_inv,
                FF(static_cast<uint8_t>(params.a.get_tag()) - static_cast<uint8_t>(params.b.get_tag())).invert()))));
}

const std::vector<ThreeOperandTestParams> EQ_TAG_ERROR_TEST_PARAMS = {
    {
        .a = MemoryValue::from<uint8_t>(42),
        .b = MemoryValue::from<uint16_t>(42),
        .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
    },
    {
        .a = MemoryValue::from<uint32_t>(123456789),
        .b = MemoryValue::from<uint64_t>(123456789),
        .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
    },
    {
        .a = MemoryValue::from<uint128_t>(123456789),
        .b = MemoryValue::from<FF>(123456789),
        .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
    },
    {
        .a = MemoryValue::from<FF>(42),
        .b = MemoryValue::from<uint8_t>(42),
        .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
    },
    {
        .a = MemoryValue::from<uint1_t>(1),
        .b = MemoryValue::from<uint8_t>(1),
        .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
    },
    {
        .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
        .b = MemoryValue::from<uint128_t>(1234567890123456789ULL),
        .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
    }
};

// Test parameters for tag error: (MemoryValue a, MemoryValue b) - different tags
INSTANTIATE_TEST_SUITE_P(AluTraceGenTest, EQTraceTagErrorTest, ::testing::ValuesIn(EQ_TAG_ERROR_TEST_PARAMS));

// NOT Opcode Tests

TestTraceContainer process_not_trace(const MemoryValue& a)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    try {
        alu.op_not(a);
    } catch (simulation::AluException& e) {
    }

    builder.process(alu_event_emitter.dump_events(), trace);
    return trace;
}

class NotOpIntegralTraceTest : public ::testing::TestWithParam<MemoryValue> {};

TEST_P(NotOpIntegralTraceTest, Basic)
{
    const MemoryValue& param = GetParam();
    auto trace = process_not_trace(param);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_not, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_NOT),
                                  ROW_FIELD_EQ(alu_ia, param.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, (~param).as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(param.get_tag())),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(param.get_tag())),
                                  ROW_FIELD_EQ(alu_ic_tag, 0),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(param.get_tag())),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0))));
}

const std::vector<MemoryValue> NOT_OP_INTEGRAL_TEST_PARAMS = {
    MemoryValue::from<uint1_t>(1),
    MemoryValue::from<uint8_t>(42),
    MemoryValue::from<uint16_t>(12345),
    MemoryValue::from<uint32_t>(123456789),
    MemoryValue::from<uint64_t>(1234567890123456789ULL),
    MemoryValue::from<uint128_t>((uint128_t(1) << 127) + 982739482),
};

INSTANTIATE_TEST_SUITE_P(AluTraceGenTest, NotOpIntegralTraceTest, ::testing::ValuesIn(NOT_OP_INTEGRAL_TEST_PARAMS));

TEST(AluTraceGenTest, TraceGenerationNotOpFF)
{
    auto trace = process_not_trace(MemoryValue::from<FF>(42));

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_not, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_NOT),
                                  ROW_FIELD_EQ(alu_ia, 42),
                                  ROW_FIELD_EQ(alu_ib, 0),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, 0),
                                  ROW_FIELD_EQ(alu_ic_tag, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 1),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1))));
}

// TRUNCATE operation (SET/CAST opcodes)

TestTraceContainer process_truncate_trace(const MemoryValue& a, const MemoryTag& dst_tag)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    EventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    EventEmitter<RangeCheckEvent> range_check_emitter;
    EventEmitter<AluEvent> alu_event_emitter;

    StrictMock<MockGreaterThan> gt; // gt should never be called in truncation
    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);

    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    alu.truncate(a, dst_tag);

    builder.process(alu_event_emitter.dump_events(), trace);
    return trace;
}

struct TruncateTrivialTestParams {
    MemoryValue a;
    MemoryTag dst_tag;
    FF expected_result;
};

const std::vector<TruncateTrivialTestParams> TRUNCATE_TRIVIAL_TEST_PARAMS = {
    {
        .a = MemoryValue::from<FF>(1),
        .dst_tag = MemoryTag::U1,
        .expected_result = 1,
    },
    {
        .a = MemoryValue::from<FF>(7),
        .dst_tag = MemoryTag::U8,
        .expected_result = 7,
    },
    {
        .a = MemoryValue::from<uint32_t>(123456789),
        .dst_tag = MemoryTag::U32,
        .expected_result = 123456789,
    },
    {
        .a = MemoryValue::from<uint128_t>(1234567890123456789ULL),
        .dst_tag = MemoryTag::U64,
        .expected_result = 1234567890123456789ULL,
    },
    {
        .a = MemoryValue::from<uint128_t>((uint128_t(1) << 127) + 982739482),
        .dst_tag = MemoryTag::U128,
        .expected_result = (uint128_t(1) << 127) + 982739482,
    },
    {
        .a = MemoryValue::from<FF>(FF::modulus - 1),
        .dst_tag = MemoryTag::FF,
        .expected_result = FF::modulus - 1,
    },
};

class TruncateTest : public ::testing::TestWithParam<TruncateTrivialTestParams> {};

TEST_P(TruncateTest, Trivial)
{
    auto params = GetParam();
    auto trace = process_truncate_trace(params.a, params.dst_tag);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_truncate, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_trivial, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_lt_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_gte_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_non_trivial, 0),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE),
                                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_ic, params.expected_result),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_a_lo, 0),
                                  ROW_FIELD_EQ(alu_a_hi, 0),
                                  ROW_FIELD_EQ(alu_mid, 0),
                                  ROW_FIELD_EQ(alu_mid_bits, 0))));
}

INSTANTIATE_TEST_SUITE_P(AluTraceGenTest, TruncateTest, ::testing::ValuesIn(TRUNCATE_TRIVIAL_TEST_PARAMS));

struct TruncateNonTrivialTestParams {
    MemoryValue a;
    MemoryTag dst_tag;
    FF expected_result;
    FF expected_lo_128;
    FF expected_hi_128;
    FF expected_mid;
};

const std::vector<TruncateNonTrivialTestParams> TRUNCATE_LESS_THAN_128_TEST_PARAMS = {
    {
        .a = MemoryValue::from<uint128_t>((uint128_t(98263) << 64) + 123456789987654321ULL),
        .dst_tag = MemoryTag::U64,
        .expected_result = 123456789987654321ULL,
        .expected_lo_128 = (uint128_t(98263) << 64) + 123456789987654321ULL,
        .expected_hi_128 = 0,
        .expected_mid = 98263,
    },
    {
        .a = MemoryValue::from<uint64_t>((uint64_t(98263) << 32) + 1234567ULL),
        .dst_tag = MemoryTag::U32,
        .expected_result = 1234567,
        .expected_lo_128 = (98263ULL << 32) + 1234567ULL,
        .expected_hi_128 = 0,
        .expected_mid = 98263,
    },
    {
        .a = MemoryValue::from<uint64_t>((uint64_t(98263) << 32) + 1234ULL),
        .dst_tag = MemoryTag::U16,
        .expected_result = 1234,
        .expected_lo_128 = (98263ULL << 32) + 1234ULL,
        .expected_hi_128 = 0,
        .expected_mid = 98263ULL << 16,
    },
    {
        .a = MemoryValue::from<FF>(263),
        .dst_tag = MemoryTag::U8,
        .expected_result = 7,
        .expected_lo_128 = 263,
        .expected_hi_128 = 0,
        .expected_mid = 1,
    },
    {
        .a = MemoryValue::from<uint64_t>(999),
        .dst_tag = MemoryTag::U1,
        .expected_result = 1,
        .expected_lo_128 = 999,
        .expected_hi_128 = 0,
        .expected_mid = 499,
    }
};

class TruncateLessThan128Test : public ::testing::TestWithParam<TruncateNonTrivialTestParams> {};

TEST_P(TruncateLessThan128Test, Basic)
{
    auto params = GetParam();
    auto trace = process_truncate_trace(params.a, params.dst_tag);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_truncate, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_trivial, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_lt_128, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_gte_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_non_trivial, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE),
                                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_ic, params.expected_result),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_a_lo, params.expected_lo_128),
                                  ROW_FIELD_EQ(alu_a_hi, params.expected_hi_128),
                                  ROW_FIELD_EQ(alu_mid, params.expected_mid),
                                  ROW_FIELD_EQ(alu_mid_bits, 128 - get_tag_bits(params.dst_tag)))));
}

INSTANTIATE_TEST_SUITE_P(AluTraceGenTest,
                         TruncateLessThan128Test,
                         ::testing::ValuesIn(TRUNCATE_LESS_THAN_128_TEST_PARAMS));

const std::vector<TruncateNonTrivialTestParams> TRUNCATE_GREATER_THAN_128_TEST_PARAMS = {
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 128) + (uint256_t(1111) << 64) + 123456789987654321ULL),
        .dst_tag = MemoryTag::U64,
        .expected_result = 123456789987654321ULL,
        .expected_lo_128 = (uint256_t(1111) << 64) + 123456789987654321ULL,
        .expected_hi_128 = 98263,
        .expected_mid = 1111,
    },
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 128) + (uint256_t(1111) << 64) + 123456789),
        .dst_tag = MemoryTag::U32,
        .expected_result = 123456789,
        .expected_lo_128 = (uint256_t(1111) << 64) + 123456789,
        .expected_hi_128 = 98263,
        .expected_mid = 1111ULL << 32,
    },
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 128) + (uint256_t(1111) << 64) + 1234),
        .dst_tag = MemoryTag::U16,
        .expected_result = 1234,
        .expected_lo_128 = (uint256_t(1111) << 64) + 1234,
        .expected_hi_128 = 98263,
        .expected_mid = 1111ULL << 48,
    },
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 150) + (uint256_t(123456789987654321ULL) << 8) + 234),
        .dst_tag = MemoryTag::U8,
        .expected_result = 234,
        .expected_lo_128 = (uint256_t(123456789987654321ULL) << 8) + 234,
        .expected_hi_128 = 98263ULL << 22,
        .expected_mid = 123456789987654321ULL,
    }
};

class TruncateGreaterThan128Test : public ::testing::TestWithParam<TruncateNonTrivialTestParams> {};

TEST_P(TruncateGreaterThan128Test, Basic)
{
    auto params = GetParam();
    auto trace = process_truncate_trace(params.a, params.dst_tag);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_truncate, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_trivial, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_lt_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_gte_128, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_non_trivial, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE),
                                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_ic, params.expected_result),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(params.dst_tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_a_lo, params.expected_lo_128),
                                  ROW_FIELD_EQ(alu_a_hi, params.expected_hi_128),
                                  ROW_FIELD_EQ(alu_mid, params.expected_mid),
                                  ROW_FIELD_EQ(alu_mid_bits, 128 - get_tag_bits(params.dst_tag)))));
}

INSTANTIATE_TEST_SUITE_P(AluTraceGenTest,
                         TruncateGreaterThan128Test,
                         ::testing::ValuesIn(TRUNCATE_GREATER_THAN_128_TEST_PARAMS));

} // namespace
} // namespace bb::avm2::tracegen
