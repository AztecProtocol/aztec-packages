#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <tuple>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::AluError;
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
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 1),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_lt_abs_diff, 0),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ff_lt, 0),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               FF(static_cast<uint8_t>(ValueTag::U128) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
            AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                  ROW_FIELD_EQ(alu_ia, u128_max),
                  ROW_FIELD_EQ(alu_ib, 4),
                  ROW_FIELD_EQ(alu_ic, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, u128_max),
                  ROW_FIELD_EQ(alu_lt_abs_diff, u128_max - 4),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ff_lt, 0),
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
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                                  ROW_FIELD_EQ(alu_ia, 1),
                                  ROW_FIELD_EQ(alu_ib, 2),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_lt_abs_diff, 0),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1),
                                  ROW_FIELD_EQ(alu_sel_ff_lt, 1),
                                  ROW_FIELD_EQ(alu_tag_ff_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                                  ROW_FIELD_EQ(alu_ia, FF::modulus - 3),
                                  ROW_FIELD_EQ(alu_ib, 4),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(ValueTag::FF)),
                                  ROW_FIELD_EQ(alu_lt_abs_diff, 0),
                                  ROW_FIELD_EQ(alu_sel_is_ff, 1),
                                  ROW_FIELD_EQ(alu_sel_ff_lt, 1),
                                  ROW_FIELD_EQ(alu_tag_ff_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// Base class for EQ tests with common setup
class AluTraceGenEQTestBase {
  protected:
    MemoryValue test_a;
    MemoryValue test_b;
};

// Parametrized test for EQ operations with same value tags
class AluTraceGenEQTest : public ::testing::TestWithParam<MemoryValue>, public AluTraceGenEQTestBase {
  protected:
    void SetUp() override
    {
        test_a = GetParam();
        test_b = test_a;
    }
};

TEST_P(AluTraceGenEQTest, SameTags)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::EQ, .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(1) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, test_a.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, test_b.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_helper1, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(test_a.get_tag())),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(test_b.get_tag())),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// Test parameters: MemoryValue a
INSTANTIATE_TEST_SUITE_P(AluTraceGenTest,
                         AluTraceGenEQTest,
                         ::testing::Values(MemoryValue::from<uint1_t>(1),
                                           MemoryValue::from<uint8_t>(42),
                                           MemoryValue::from<uint16_t>(12345),
                                           MemoryValue::from<uint32_t>(123456789),
                                           MemoryValue::from<uint64_t>(1234567890123456789ULL),
                                           MemoryValue::from<uint128_t>(123456789),
                                           MemoryValue::from<FF>(42)));

// Parametrized test for EQ operations with different value tags
struct EQTestParams {
    MemoryValue a;
    MemoryValue b;
};

// Parametrized test for EQ operations with different value tags (inequality case)
class AluTraceGenEQInequalityTest : public ::testing::TestWithParam<EQTestParams>, public AluTraceGenEQTestBase {
  protected:
    void SetUp() override
    {
        auto params = GetParam();
        test_a = params.a;
        test_b = params.b;
    }
};

TEST_P(AluTraceGenEQInequalityTest, SameTags)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::EQ, .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(0) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, test_a.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, test_b.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_helper1, FF(test_a.as_ff() - test_b.as_ff()).invert()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(test_a.get_tag())),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(test_b.get_tag())),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// Test parameters for inequality: (MemoryValue a, MemoryValue b) - values are different
INSTANTIATE_TEST_SUITE_P(
    AluTraceGenTest,
    AluTraceGenEQInequalityTest,
    ::testing::Values(
        EQTestParams{ .a = MemoryValue::from<uint1_t>(1), .b = MemoryValue::from<uint1_t>(0) },
        EQTestParams{ .a = MemoryValue::from<uint8_t>(42), .b = MemoryValue::from<uint8_t>(24) },
        EQTestParams{ .a = MemoryValue::from<uint16_t>(12345), .b = MemoryValue::from<uint16_t>(54321) },
        EQTestParams{ .a = MemoryValue::from<uint32_t>(123456789), .b = MemoryValue::from<uint32_t>(987654321) },
        EQTestParams{ .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
                      .b = MemoryValue::from<uint64_t>(9876543210987654321ULL) },
        EQTestParams{ .a = MemoryValue::from<uint128_t>(123456789), .b = MemoryValue::from<uint128_t>(987654321) },
        EQTestParams{ .a = MemoryValue::from<FF>(FF::modulus - 3), .b = MemoryValue::from<FF>(FF::modulus - 1) }));

// Parametrized test for EQ operations with different value tags (tag error case)
class AluTraceGenEQTagError : public ::testing::TestWithParam<EQTestParams>, public AluTraceGenEQTestBase {
  protected:
    void SetUp() override
    {
        auto params = GetParam();
        test_a = params.a;
        test_b = params.b;
    }
};

TEST_P(AluTraceGenEQTagError, DifferentTags)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::EQ,
              .a = test_a,
              .b = test_b,
              .c = MemoryValue::from<uint1_t>(1),
              .error = AluError::TAG_ERROR },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                  ROW_FIELD_EQ(alu_ia, test_a.as_ff()),
                  ROW_FIELD_EQ(alu_ib, test_b.as_ff()),
                  ROW_FIELD_EQ(alu_ic, 1),
                  ROW_FIELD_EQ(alu_helper1, 0),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(test_a.get_tag())),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(test_b.get_tag())),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_sel_tag_err, 1),
                  ROW_FIELD_EQ(
                      alu_ab_tags_diff_inv,
                      FF(static_cast<uint8_t>(test_a.get_tag()) - static_cast<uint8_t>(test_b.get_tag())).invert()))));
}

// Test parameters for tag error: (MemoryValue a, MemoryValue b) - different tags
INSTANTIATE_TEST_SUITE_P(
    AluTraceGenTest,
    AluTraceGenEQTagError,
    ::testing::Values(
        EQTestParams{ .a = MemoryValue::from<uint8_t>(42), .b = MemoryValue::from<uint16_t>(42) },
        EQTestParams{ .a = MemoryValue::from<uint32_t>(123456789), .b = MemoryValue::from<uint64_t>(123456789) },
        EQTestParams{ .a = MemoryValue::from<uint128_t>(123456789), .b = MemoryValue::from<FF>(123456789) },
        EQTestParams{ .a = MemoryValue::from<FF>(42), .b = MemoryValue::from<uint8_t>(42) },
        EQTestParams{ .a = MemoryValue::from<uint1_t>(1), .b = MemoryValue::from<uint8_t>(1) },
        EQTestParams{ .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
                      .b = MemoryValue::from<uint128_t>(1234567890123456789ULL) }));

} // namespace
} // namespace bb::avm2::tracegen
