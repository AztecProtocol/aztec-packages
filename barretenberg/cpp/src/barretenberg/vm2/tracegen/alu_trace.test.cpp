#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <tuple>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
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

// Generic structure for three-operand opcodes
struct ThreeOperandTestInputs {
    MemoryValue a;
    MemoryValue b;
};

// The below test values do not carry for ADD operations:
const std::vector<ThreeOperandTestInputs> TEST_VALUES = {
    {
        MemoryValue::from_tag(MemoryTag::U1, 1),
        MemoryValue::from_tag(MemoryTag::U1, 0),
    },
    {
        MemoryValue::from_tag(MemoryTag::U8, 42),
        MemoryValue::from_tag(MemoryTag::U8, 24),
    },
    {
        MemoryValue::from_tag(MemoryTag::U16, 5432),
        MemoryValue::from_tag(MemoryTag::U16, 54321),
    },
    {
        MemoryValue::from_tag(MemoryTag::U32, 123456789),
        MemoryValue::from_tag(MemoryTag::U32, 987654321),
    },
    {
        MemoryValue::from_tag(MemoryTag::U64, 1234567890123456789ULL),
        MemoryValue::from_tag(MemoryTag::U64, 9876543210987654321ULL),
    },
    {
        MemoryValue::from_tag(MemoryTag::U128, 9876543210987654320ULL),
        MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 9876543210987654321ULL),
    },
    {
        MemoryValue::from_tag(MemoryTag::FF, 2),
        MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 4),
    },
};

const std::unordered_map<MemoryTag, MemoryTag> TAG_ERROR_TEST_VALUES = {
    { MemoryTag::FF, MemoryTag::U1 },   { MemoryTag::U1, MemoryTag::U8 },   { MemoryTag::U8, MemoryTag::U16 },
    { MemoryTag::U16, MemoryTag::U32 }, { MemoryTag::U32, MemoryTag::U64 }, { MemoryTag::U64, MemoryTag::U128 },
    { MemoryTag::U128, MemoryTag::FF },
};

TestTraceContainer process_add_trace(const ThreeOperandTestInputs& params, bool error = false)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = params.a,
              .b = params.b,
              .c = error ? MemoryValue::from_tag(params.a.get_tag(), params.a.as_ff() + params.b.as_ff())
                         : params.a + params.b,
              .error = error ? std::make_optional(AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    return trace;
}

TestTraceContainer process_lt_trace(const ThreeOperandTestInputs& params, bool error = false)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    auto c = static_cast<uint256_t>(params.a.as_ff()) < static_cast<uint256_t>(params.b.as_ff()) ? 1 : 0;

    builder.process(
        {
            { .operation = AluOperation::LT,
              .a = params.a,
              .b = params.b,
              .c = MemoryValue::from_tag(MemoryTag::U1, c),
              .error = error ? std::make_optional(AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    return trace;
}

TestTraceContainer process_lte_trace(const ThreeOperandTestInputs& params, bool eq = false, bool error = false)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    auto c = eq || static_cast<uint256_t>(params.a.as_ff()) <= static_cast<uint256_t>(params.b.as_ff()) ? 1 : 0;

    builder.process(
        {
            { .operation = AluOperation::LTE,
              .a = params.a,
              .b = eq ? params.a : params.b,
              .c = MemoryValue::from_tag(MemoryTag::U1, c),
              .error = error ? std::make_optional(AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    return trace;
}

TestTraceContainer process_eq_trace(const ThreeOperandTestInputs& params, bool eq = true, bool error = false)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::EQ,
              .a = params.a,
              .b = eq ? params.a : params.b,
              // In the case of an error, we do not set c, so it defaults to 0, 0:
              .c = error ? MemoryValue::from_tag(static_cast<MemoryTag>(0), 0)
                         : MemoryValue::from_tag(MemoryTag::U1, static_cast<uint8_t>(eq)),
              .error = error ? std::make_optional(AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    return trace;
}

TestTraceContainer process_not_trace(const ThreeOperandTestInputs& params)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    bool is_ff = params.a.get_tag() == MemoryTag::FF;

    builder.process(
        {
            { .operation = AluOperation::NOT,
              .a = params.a,
              .b = params.b,
              .error = is_ff ? std::make_optional(AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    return trace;
}

class AluTraceTagTest : public ::testing::TestWithParam<ThreeOperandTestInputs> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenTest, AluTraceTagTest, ::testing::ValuesIn(TEST_VALUES));

TEST_P(AluTraceTagTest, TraceGenerationBasicAdd)
{
    const auto params = GetParam();
    auto tag = params.a.get_tag();
    auto trace = process_add_trace(params);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, params.b.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, (params.a + params.b).as_ff()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluTraceTagTest, TraceGenerationAddCarry)
{
    const auto param = GetParam().a;
    auto tag = param.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    auto max_value = get_tag_max_value(tag);
    auto trace = process_add_trace({ param, MemoryValue::from_tag(tag, max_value) });

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                                  ROW_FIELD_EQ(alu_ia, param.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, max_value),
                                  ROW_FIELD_EQ(alu_ic, param.as_ff() - 1),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_cf, !is_ff),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluTraceTagTest, TraceGenerationAddTagError)
{
    const auto params = GetParam();
    auto a_tag = params.a.get_tag();
    // Using from_tag_truncating for tag error testing when we have FF:
    auto b = MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(params.b.get_tag()), params.b);
    auto trace = process_add_trace({ params.a, b }, true);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                          ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                          ROW_FIELD_EQ(alu_ib, b.as_ff()),
                          ROW_FIELD_EQ(alu_ic, params.a.as_ff() + b.as_ff()),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(a_tag)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(b.get_tag())),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(a_tag)),
                          ROW_FIELD_EQ(alu_cf, 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(a_tag)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(a_tag)),
                          ROW_FIELD_EQ(alu_sel_tag_err, 1),
                          ROW_FIELD_EQ(alu_ab_tags_diff_inv,
                                       FF(static_cast<uint8_t>(a_tag) - static_cast<uint8_t>(b.get_tag())).invert()))));
}

TEST_P(AluTraceTagTest, TraceGenerationLT)
{
    const auto params = GetParam();
    auto tag = params.a.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    auto c = static_cast<uint256_t>(params.a.as_ff()) < static_cast<uint256_t>(params.b.as_ff()) ? 1 : 0;
    auto trace = process_lt_trace(params);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_lt, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_ib, params.b.as_ff()),
                  ROW_FIELD_EQ(alu_ic, c),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, params.b.as_ff()),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, c),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                  ROW_FIELD_EQ(alu_sel_is_ff, is_ff),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, is_ff),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, !is_ff),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               is_ff ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluTraceTagTest, TraceGenerationLTTagError)
{
    const auto params = GetParam();
    auto a_tag = params.a.get_tag();
    // Using from_tag_truncating for tag error testing when we have FF:
    auto b = MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(params.b.get_tag()), params.b);
    bool is_ff = a_tag == MemoryTag::FF;
    auto c = static_cast<uint256_t>(params.a.as_ff()) < static_cast<uint256_t>(b.as_ff()) ? 1 : 0;
    auto trace = process_lt_trace({ params.a, b }, true);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_lt, 1),
            ROW_FIELD_EQ(alu_sel_lt_ops, 0), // sel_lt_ops is gated by sel_tag_err
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
            ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
            ROW_FIELD_EQ(alu_ib, b.as_ff()),
            ROW_FIELD_EQ(alu_ic, c),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(a_tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(b.get_tag())),
            ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
            ROW_FIELD_EQ(alu_cf, 0),
            ROW_FIELD_EQ(alu_lt_ops_input_a, b.as_ff()),
            ROW_FIELD_EQ(alu_lt_ops_input_b, params.a.as_ff()),
            ROW_FIELD_EQ(alu_lt_ops_result_c, c),
            ROW_FIELD_EQ(alu_max_bits, get_tag_bits(a_tag)),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(a_tag)),
            ROW_FIELD_EQ(alu_sel_is_ff, is_ff),
            ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
            ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
            ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                         is_ff ? 0 : FF(static_cast<uint8_t>(a_tag) - static_cast<uint8_t>(ValueTag::FF)).invert()),
            ROW_FIELD_EQ(alu_sel_tag_err, 1),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv,
                         FF(static_cast<uint8_t>(a_tag) - static_cast<uint8_t>(b.get_tag())).invert()))));
}

TEST_P(AluTraceTagTest, TraceGenerationLTE)
{
    const auto params = GetParam();
    auto tag = params.a.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    auto c = static_cast<uint256_t>(params.a.as_ff()) <= static_cast<uint256_t>(params.b.as_ff()) ? 1 : 0;
    auto trace = process_lte_trace(params);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_ib, params.b.as_ff()),
                  ROW_FIELD_EQ(alu_ic, c),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, params.b.as_ff()),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, c == 0 ? 1 : 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                  ROW_FIELD_EQ(alu_sel_is_ff, is_ff),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, is_ff),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, !is_ff),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               is_ff ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluTraceTagTest, TraceGenerationLTEEq)
{
    const auto params = GetParam();
    auto tag = params.a.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    auto trace = process_lte_trace(params, true);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_lte, 1),
                  ROW_FIELD_EQ(alu_sel_lt_ops, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_ib, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_ic, 1),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_lt_ops_input_a, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_lt_ops_input_b, params.a.as_ff()),
                  ROW_FIELD_EQ(alu_lt_ops_result_c, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                  ROW_FIELD_EQ(alu_sel_is_ff, is_ff),
                  ROW_FIELD_EQ(alu_sel_ff_lt_ops, is_ff),
                  ROW_FIELD_EQ(alu_sel_int_lt_ops, !is_ff),
                  ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                               is_ff ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(ValueTag::FF)).invert()),
                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluTraceTagTest, TraceGenerationLTETagError)
{
    const auto params = GetParam();
    auto a_tag = params.a.get_tag();
    // Using from_tag_truncating for tag error testing when we have FF:
    auto b = MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(params.b.get_tag()), params.b);
    bool is_ff = a_tag == MemoryTag::FF;
    auto c = static_cast<uint256_t>(params.a.as_ff()) <= static_cast<uint256_t>(b.as_ff()) ? 1 : 0;
    auto trace = process_lte_trace({ params.a, b }, false, true);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_lte, 1),
            ROW_FIELD_EQ(alu_sel_lt_ops, 0), // sel_lt_ops is gated by sel_tag_err
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
            ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
            ROW_FIELD_EQ(alu_ib, b.as_ff()),
            ROW_FIELD_EQ(alu_ic, c),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(a_tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(b.get_tag())),
            ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
            ROW_FIELD_EQ(alu_cf, 0),
            ROW_FIELD_EQ(alu_lt_ops_input_a, params.a.as_ff()),
            ROW_FIELD_EQ(alu_lt_ops_input_b, b.as_ff()),
            ROW_FIELD_EQ(alu_lt_ops_result_c,
                         0), // for LTE, we usually flip c for the lookup, so we must gate it by sel_tag_err
            ROW_FIELD_EQ(alu_max_bits, get_tag_bits(a_tag)),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(a_tag)),
            ROW_FIELD_EQ(alu_sel_is_ff, is_ff),
            ROW_FIELD_EQ(alu_sel_ff_lt_ops, 0),
            ROW_FIELD_EQ(alu_sel_int_lt_ops, 0),
            ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                         is_ff ? 0 : FF(static_cast<uint8_t>(a_tag) - static_cast<uint8_t>(ValueTag::FF)).invert()),
            ROW_FIELD_EQ(alu_sel_tag_err, 1),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv,
                         FF(static_cast<uint8_t>(a_tag) - static_cast<uint8_t>(b.get_tag())).invert()))));
}

// EQ TESTS

TEST_P(AluTraceTagTest, TraceGenerationBasicEq)
{
    const auto params = GetParam();
    auto trace = process_eq_trace(params);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, params.a.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_helper1, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.a.get_tag())),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(params.a.get_tag())),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(ValueTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluTraceTagTest, TraceGenerationBasicInEq)
{
    const auto params = GetParam();
    auto trace = process_eq_trace(params, false);

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

TEST_P(AluTraceTagTest, TraceGenerationEqTagError)
{
    const auto params = GetParam();
    // Using from_tag_truncating for tag error testing when we have FF:
    auto b = MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(params.b.get_tag()), params.b);

    auto trace = process_eq_trace({ params.a, b }, false, true);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_eq, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
            ROW_FIELD_EQ(alu_ia, params.a.as_ff()),
            ROW_FIELD_EQ(alu_ib, b.as_ff()),
            ROW_FIELD_EQ(alu_ic, 0),
            ROW_FIELD_EQ(alu_helper1, FF(params.a.as_ff() - b.as_ff()).invert()),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(params.a.get_tag())),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(b.get_tag())),
            ROW_FIELD_EQ(alu_ic_tag, 0),
            ROW_FIELD_EQ(alu_sel_tag_err, 1),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv,
                         FF(static_cast<uint8_t>(params.a.get_tag()) - static_cast<uint8_t>(b.get_tag())).invert()))));
}

// NOT TESTS

TEST_P(AluTraceTagTest, TraceGenerationNot)
{

    const auto param = GetParam().a;
    auto tag = param.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    auto b = is_ff ? MemoryValue::from_tag(tag, 0) : ~MemoryValue::from_tag(tag, param);
    auto trace = process_not_trace({ param, b });

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_not, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_NOT),
                                  ROW_FIELD_EQ(alu_ia, param.as_ff()),
                                  ROW_FIELD_EQ(alu_ib, b.as_ff()),
                                  ROW_FIELD_EQ(alu_ic, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ic_tag, 0),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, is_ff),
                                  ROW_FIELD_EQ(alu_sel_is_ff, is_ff))));
}
} // namespace
} // namespace bb::avm2::tracegen
