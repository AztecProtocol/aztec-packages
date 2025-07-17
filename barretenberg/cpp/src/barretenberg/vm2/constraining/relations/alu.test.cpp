#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <utility>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/alu.hpp"
#include "barretenberg/vm2/generated/relations/lookups_alu.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using alu = bb::avm2::alu<FF>;
using tracegen::AluTraceBuilder;
using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::GreaterThanTraceBuilder;
using tracegen::PrecomputedTraceBuilder;

constexpr uint8_t NUM_OF_TAGS = static_cast<uint8_t>(MemoryTag::MAX) + 1;

// Generic structure for three-operand opcodes
struct ThreeOperandTestInputs {
    MemoryValue a;
    MemoryValue b;
};

// The below test values do not carry for ADD operations:
const std::unordered_map<MemoryTag, ThreeOperandTestInputs> TEST_VALUES = {
    { MemoryTag::U1,
      {
          MemoryValue::from_tag(MemoryTag::U1, 1),
          MemoryValue::from_tag(MemoryTag::U1, 0),
      } },
    { MemoryTag::U8,
      {
          MemoryValue::from_tag(MemoryTag::U8, 42),
          MemoryValue::from_tag(MemoryTag::U8, 24),
      } },
    { MemoryTag::U16,
      {
          MemoryValue::from_tag(MemoryTag::U16, 5432),
          MemoryValue::from_tag(MemoryTag::U16, 54321),
      } },
    { MemoryTag::U32,
      {
          MemoryValue::from_tag(MemoryTag::U32, 123456789),
          MemoryValue::from_tag(MemoryTag::U32, 987654321),
      } },
    { MemoryTag::U64,
      {
          MemoryValue::from_tag(MemoryTag::U64, 1234567890123456789ULL),
          MemoryValue::from_tag(MemoryTag::U64, 9876543210987654321ULL),
      } },
    { MemoryTag::U128,
      {
          MemoryValue::from_tag(MemoryTag::U128, 9876543210987654320ULL),
          MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 9876543210987654321ULL),
      } },
    { MemoryTag::FF,
      {
          MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 3),
          MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 1),
      } },
};

const std::unordered_map<MemoryTag, MemoryTag> TAG_ERROR_TEST_VALUES = {
    { MemoryTag::FF, MemoryTag::U1 },   { MemoryTag::U1, MemoryTag::U8 },   { MemoryTag::U8, MemoryTag::U16 },
    { MemoryTag::U16, MemoryTag::U32 }, { MemoryTag::U32, MemoryTag::U64 }, { MemoryTag::U64, MemoryTag::U128 },
    { MemoryTag::U128, MemoryTag::FF },
};

TestTraceContainer process_basic_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto [a, b] = TEST_VALUES.at(input_tag);
    auto c = a + b;
    auto tag = static_cast<uint8_t>(input_tag);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = tag,
            .alu_max_bits = get_tag_bits(input_tag),
            .alu_max_value = get_tag_max_value(input_tag),
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,                           // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                           // = ib_tag
            .execution_mem_tag_reg_2_ = tag,                           // = ic_tag
            .execution_register_0_ = a,                                // = ia
            .execution_register_1_ = b,                                // = ib
            .execution_register_2_ = c,                                // = ic
            .execution_sel_execute_alu = 1,                            // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_ADD, // = alu_op_id
        },
    });

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_basic_add_with_tracegen(MemoryTag input_tag, bool error = false)
{
    PrecomputedTraceBuilder precomputed_builder;
    TestTraceContainer trace;
    AluTraceBuilder builder;
    auto [a, b] = TEST_VALUES.at(input_tag);
    auto c = a + b;
    // Using from_tag_truncating for tag error testing:
    b = error ? MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(input_tag), b) : b;
    builder.process(
        {
            { .operation = simulation::AluOperation::ADD,
              .a = a,
              .b = b,
              .c = c,
              .error = error ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_carry_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto tag = static_cast<uint8_t>(input_tag);
    // Special cases for U1 since the only 'carry' case is 1 + 1 = 0:
    bool is_u1 = input_tag == MemoryTag::U1;
    auto a = is_u1 ? 1 : get_tag_max_value(input_tag) - 1;
    auto b = is_u1 ? 1 : 3;
    auto c = is_u1 ? 0 : 1;
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = tag,
            .alu_max_bits = get_tag_bits(input_tag),
            .alu_max_value = get_tag_max_value(input_tag),
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,                           // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                           // = ib_tag
            .execution_mem_tag_reg_2_ = tag,                           // = ic_tag
            .execution_register_0_ = a,                                // = ia
            .execution_register_1_ = b,                                // = ib
            .execution_register_2_ = c,                                // = ic
            .execution_sel_execute_alu = 1,                            // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_ADD, // = alu_op_id
        },
    });

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_carry_add_with_tracegen(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    TestTraceContainer trace;
    AluTraceBuilder builder;
    // Special cases for U1 since the only 'carry' case is 1 + 1 = 0:
    bool is_u1 = input_tag == MemoryTag::U1;
    auto a = is_u1 ? 1 : get_tag_max_value(input_tag) - 1;
    auto b = is_u1 ? 1 : 3;
    auto c = is_u1 ? 0 : 1;

    builder.process(
        {
            { .operation = simulation::AluOperation::ADD,
              .a = MemoryValue::from_tag(input_tag, a),
              .b = MemoryValue::from_tag(input_tag, b),
              .c = MemoryValue::from_tag(input_tag, c) },
        },
        trace);

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_lt_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    auto [a, b] = TEST_VALUES.at(input_tag);
    auto tag = static_cast<uint8_t>(input_tag);
    auto is_ff = input_tag == MemoryTag::FF;
    auto c = static_cast<uint256_t>(a.as_ff()) < static_cast<uint256_t>(b.as_ff()) ? 1 : 0;

    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = static_cast<uint8_t>(MemoryTag::U1),
            .alu_lt_ops_input_a = b,
            .alu_lt_ops_input_b = a,
            .alu_lt_ops_result_c = c,
            .alu_max_bits = get_tag_bits(input_tag),
            .alu_max_value = get_tag_max_value(input_tag),
            .alu_op_id = AVM_EXEC_OP_ID_ALU_LT,
            .alu_sel = 1,
            .alu_sel_ff_lt_ops = static_cast<uint8_t>(is_ff),
            .alu_sel_int_lt_ops = static_cast<uint8_t>(!is_ff),
            .alu_sel_is_ff = static_cast<uint8_t>(is_ff),
            .alu_sel_lt_ops = 1,
            .alu_sel_op_lt = 1,
            .alu_tag_ff_diff_inv = is_ff ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert(),
            .execution_mem_tag_reg_0_ = tag,                                 // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                                 // = ib_tag
            .execution_mem_tag_reg_2_ = static_cast<uint8_t>(MemoryTag::U1), // = ic_tag
            .execution_register_0_ = a,                                      // = ia
            .execution_register_1_ = b,                                      // = ib
            .execution_register_2_ = c,                                      // = ic
            .execution_sel_execute_alu = 1,                                  // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_LT,        // = alu_op_id
        },
    });

    if (is_ff) {
        field_gt_builder.process({ { .a = b, .b = a, .result = c == 1 } }, trace);
    } else {
        gt_builder.process(
            { { .a = static_cast<uint128_t>(b.as_ff()), .b = static_cast<uint128_t>(a.as_ff()), .result = c == 1 } },
            trace);
    }

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_lt_with_tracegen(MemoryTag input_tag, bool error = false)
{
    PrecomputedTraceBuilder precomputed_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    TestTraceContainer trace;
    AluTraceBuilder builder;
    auto [a, b] = TEST_VALUES.at(input_tag);
    auto is_ff = input_tag == MemoryTag::FF;
    auto c = static_cast<uint256_t>(a.as_ff()) < static_cast<uint256_t>(b.as_ff()) ? 1 : 0;
    // Using from_tag_truncating for tag error testing:
    b = error ? MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(input_tag), b) : b;

    builder.process(
        {
            { .operation = simulation::AluOperation::LT,
              .a = a,
              .b = b,
              .c = MemoryValue::from_tag(MemoryTag::U1, c),
              .error = error ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    if (is_ff) {
        field_gt_builder.process({ { .a = b, .b = a, .result = c == 1 } }, trace);
    } else {
        gt_builder.process(
            { { .a = static_cast<uint128_t>(b.as_ff()), .b = static_cast<uint128_t>(a.as_ff()), .result = c == 1 } },
            trace);
    }
    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_lte_trace(MemoryTag input_tag, bool eq = false)
{
    PrecomputedTraceBuilder precomputed_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    auto [a, _b] = TEST_VALUES.at(input_tag);
    auto tag = static_cast<uint8_t>(input_tag);
    auto is_ff = input_tag == MemoryTag::FF;
    auto b = eq ? a : _b;
    auto c = static_cast<uint256_t>(a.as_ff()) <= static_cast<uint256_t>(b.as_ff()) ? 1 : 0;

    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = static_cast<uint8_t>(MemoryTag::U1),
            .alu_lt_ops_input_a = a,
            .alu_lt_ops_input_b = b,
            .alu_lt_ops_result_c = c == 0 ? 1 : 0,
            .alu_max_bits = get_tag_bits(input_tag),
            .alu_max_value = get_tag_max_value(input_tag),
            .alu_op_id = AVM_EXEC_OP_ID_ALU_LTE,
            .alu_sel = 1,
            .alu_sel_ff_lt_ops = static_cast<uint8_t>(is_ff),
            .alu_sel_int_lt_ops = static_cast<uint8_t>(!is_ff),
            .alu_sel_is_ff = static_cast<uint8_t>(is_ff),
            .alu_sel_lt_ops = 1,
            .alu_sel_op_lte = 1,
            .alu_tag_ff_diff_inv = is_ff ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert(),
            .execution_mem_tag_reg_0_ = tag,                                 // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                                 // = ib_tag
            .execution_mem_tag_reg_2_ = static_cast<uint8_t>(MemoryTag::U1), // = ic_tag
            .execution_register_0_ = a,                                      // = ia
            .execution_register_1_ = b,                                      // = ib
            .execution_register_2_ = c,                                      // = ic
            .execution_sel_execute_alu = 1,                                  // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_LTE,       // = alu_op_id
        },
    });

    if (is_ff) {
        field_gt_builder.process({ { .a = a, .b = b, .result = c == 0 } }, trace);
    } else {
        gt_builder.process(
            { { .a = static_cast<uint128_t>(a.as_ff()), .b = static_cast<uint128_t>(b.as_ff()), .result = c == 0 } },
            trace);
    }
    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_lte_with_tracegen(MemoryTag input_tag, bool eq = false, bool error = false)
{
    PrecomputedTraceBuilder precomputed_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    TestTraceContainer trace;
    AluTraceBuilder builder;
    auto [a, _b] = TEST_VALUES.at(input_tag);
    auto is_ff = input_tag == MemoryTag::FF;
    auto b = eq ? a : _b;
    auto c = static_cast<uint256_t>(a.as_ff()) <= static_cast<uint256_t>(b.as_ff()) ? 1 : 0;
    // Using from_tag_truncating for tag error testing:
    b = error ? MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(input_tag), b) : b;

    builder.process(
        {
            { .operation = simulation::AluOperation::LTE,
              .a = a,
              .b = b,
              .c = MemoryValue::from_tag(MemoryTag::U1, c),
              .error = error ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    if (is_ff) {
        field_gt_builder.process({ { .a = a, .b = b, .result = c == 0 } }, trace);
    } else {
        gt_builder.process(
            { { .a = static_cast<uint128_t>(a.as_ff()), .b = static_cast<uint128_t>(b.as_ff()), .result = c == 0 } },
            trace);
    }
    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_eq_trace_with_tracegen(MemoryTag input_tag, bool eq = true, bool error = false)
{
    PrecomputedTraceBuilder precomputed_builder;

    TestTraceContainer trace;
    AluTraceBuilder builder;
    auto [a, _b] = TEST_VALUES.at(input_tag);
    auto b = eq ? a : _b;
    auto c = static_cast<uint8_t>(a == b);
    // Using from_tag_truncating for tag error testing:
    b = error ? MemoryValue::from_tag_truncating(TAG_ERROR_TEST_VALUES.at(input_tag), b) : b;

    builder.process(
        {
            { .operation = simulation::AluOperation::EQ,
              .a = a,
              .b = b,
              .c = MemoryValue::from_tag(MemoryTag::U1, c),
              .error = error ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_not_trace_with_tracegen(MemoryTag input_tag, bool error = false)
{
    PrecomputedTraceBuilder precomputed_builder;

    TestTraceContainer trace;
    AluTraceBuilder builder;

    auto [a, _b] = TEST_VALUES.at(input_tag);
    auto b_tag = error ? TAG_ERROR_TEST_VALUES.at(input_tag) : input_tag;
    bool is_ff = b_tag == MemoryTag::FF;
    auto b = is_ff ? MemoryValue::from_tag(b_tag, 0)
                   : ~MemoryValue::from_tag_truncating(b_tag, a); // Using from_tag_truncating for tag error testing

    builder.process(
        {
            { .operation = simulation::AluOperation::NOT,
              .a = a,
              .b = b,
              .error = error || is_ff ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

class AluTagTest : public ::testing::TestWithParam<MemoryTag> {};

INSTANTIATE_TEST_SUITE_P(
    AluConstrainingTest,
    AluTagTest,
    ::testing::Values(
        MemoryTag::U1, MemoryTag::U8, MemoryTag::U16, MemoryTag::U32, MemoryTag::U64, MemoryTag::U128, MemoryTag::FF));

TEST(AluConstrainingTest, EmptyRow)
{
    check_relation<alu>(testing::empty_trace());
}

// ADD TESTS

TEST_P(AluTagTest, AluBasicAddTag)
{
    const auto tag = GetParam();
    auto trace = process_basic_add_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluBasicAddTagTraceGen)
{
    const auto tag = GetParam();
    auto trace = process_basic_add_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluCarryAddTag)
{
    const auto tag = GetParam();
    auto trace = process_carry_add_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluCarryAddTagTraceGen)
{
    const auto tag = GetParam();
    auto trace = process_carry_add_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AluNegativeAddWrongOpId)
{
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD + 1,
            .alu_sel_op_add = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_OP_ID_CHECK), "OP_ID_CHECK");
}

TEST_P(AluTagTest, AluNegativeBasicAddTag)
{
    const auto tag = GetParam();
    auto trace = process_basic_add_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, trace.get(Column::alu_ic, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST_P(AluTagTest, AluBasicAddTagTraceGenError)
{
    const auto tag = GetParam();
    auto trace = process_basic_add_with_tracegen(tag, true);
    // Though the tags don't match, with error handling we can return the error rather than fail:
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    // Removing the error will fail:
    trace.set(Column::alu_sel_tag_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

TEST(AluConstrainingTest, AluNegativeAddCarryU1)
{
    auto trace = process_carry_add_trace(MemoryTag::U1);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_cf, 0, 0);
    // If we are overflowing, we need to set the carry flag...
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");

    trace.set(Column::alu_cf, 0, 1);
    trace.set(Column::alu_max_value, 0, 0);
    // ...and the correct max_value:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST(AluConstrainingTest, AluNegativeAddCarryU8)
{
    auto trace = process_carry_add_trace(MemoryTag::U8);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    // TODO(MW): The below should fail the range check on c in memory, but we cannot test this yet.
    // Instead, we assume the carry flag is correct and show an overflow fails:
    trace.set(Column::alu_ic, 0, 257);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST(AluConstrainingTest, AluNegativeAddWrongTag)
{
    // If the values are actually U8s, but we set the tags as U16, then the max value will fail
    auto trace = process_basic_add_trace(MemoryTag::U16);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_max_value, 0, get_tag_max_value(MemoryTag::U8));
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_BITS_VALUE");
}

TEST(AluConstrainingTest, AluNegativeAddWrongTagCMismatch)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U16);
    auto trace = process_basic_add_trace(MemoryTag::U16);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, tag - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}

// LT TESTS

TEST_P(AluTagTest, AluLTTag)
{
    const auto tag = GetParam();
    auto trace = process_lt_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluLTTagTraceGen)
{
    const auto tag = GetParam();
    auto trace = process_lt_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluLTTagTraceGenError)
{
    const auto tag = GetParam();
    auto trace = process_lt_with_tracegen(tag, true);
    // Though the tags don't match, with error handling we can return the error rather than fail:
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    // Removing the error will fail:
    trace.set(Column::alu_sel_tag_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

TEST_P(AluTagTest, AluLTTagNegative)
{
    const auto tag = GetParam();
    auto trace = process_lt_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    bool c = trace.get(Column::alu_ic, 0) == 1;

    // Swap the result bool:
    trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
    trace.set(Column::alu_lt_ops_result_c, 0, static_cast<uint8_t>(!c));

    // We rely on lookups, so we expect the relations to still pass...
    check_relation<alu>(trace);

    // ... but the lookup will fail (TODO(MW): properly add a gt and => range check events so it fails because c
    // is wrong, rather than because this test has not processed the events):
    if (tag == MemoryTag::FF) {
        EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_ff_gt_settings>(trace)),
                                  "LOOKUP_ALU_FF_GT");
    } else {
        EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_int_gt_settings>(trace)),
                                  "LOOKUP_ALU_INT_GT");
    }
}

// LTE TESTS

TEST_P(AluTagTest, AluLTETag)
{
    const auto tag = GetParam();
    auto trace = process_lte_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluLTEEqTag)
{
    const auto tag = GetParam();
    auto trace = process_lte_trace(tag, true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluLTETagTraceGen)
{
    const auto tag = GetParam();
    auto trace = process_lte_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluLTEEqTagTraceGen)
{
    const auto tag = GetParam();
    auto trace = process_lte_with_tracegen(tag, true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluLTETagTraceGenError)
{
    const auto tag = GetParam();
    auto trace = process_lte_with_tracegen(tag, true, true);
    // Though the tags don't match, with error handling we can return the error rather than fail:
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);

    // Removing the error will fail:
    trace.set(Column::alu_sel_tag_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

TEST_P(AluTagTest, AluLTETagNegative)
{
    const auto tag = GetParam();
    auto trace = process_lte_trace(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    bool c = trace.get(Column::alu_ic, 0) == 1;

    // Swap the result bool:
    trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
    trace.set(Column::alu_lt_ops_result_c, 0, static_cast<uint8_t>(c));

    // We rely on lookups, so we expect the relations to still pass...
    check_relation<alu>(trace);

    // ... but the lookup will fail (TODO(MW): properly add a gt and => range check events so it fails because c
    // is wrong, rather than because this test has not processed the events):
    if (tag == MemoryTag::FF) {
        EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_ff_gt_settings>(trace)),
                                  "LOOKUP_ALU_FF_GT");
    } else {
        EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_int_gt_settings>(trace)),
                                  "LOOKUP_ALU_INT_GT");
    }
}

// EQ TESTS

TEST_P(AluTagTest, AluEQ)
{
    const auto tag = GetParam();
    auto trace = process_eq_trace_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluEQInequality)
{
    const auto tag = GetParam();
    auto trace = process_eq_trace_with_tracegen(tag, false);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluEQTagError)
{
    const auto tag = GetParam();
    auto trace = process_eq_trace_with_tracegen(tag, false, true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

// Negative tests for EQ operations
TEST(AluConstrainingTest, AluNegativeEQWrongOpId)
{
    auto trace = process_eq_trace_with_tracegen(MemoryTag::U8);
    check_relation<alu>(trace);
    trace.set(Column::alu_op_id, 0, AVM_EXEC_OP_ID_ALU_ADD);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "OP_ID_CHECK");
}

TEST(AluConstrainingTest, AluNegativeEQWrongResult)
{
    auto trace = process_eq_trace_with_tracegen(MemoryTag::U8);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, 0); // Wrong result
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "EQ_OP_MAIN");
}

TEST(AluConstrainingTest, AluNegativeEQWrongHelper1)
{
    auto trace = process_eq_trace_with_tracegen(MemoryTag::U8, false);
    check_relation<alu>(trace);
    trace.set(Column::alu_helper1, 0, 1111); // Wrong helper1 for inequality
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "EQ_OP_MAIN");
}

TEST(AluConstrainingTest, AluNegativeEQWrongTagCMismatch)
{
    auto trace = process_eq_trace_with_tracegen(MemoryTag::U16);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, static_cast<uint8_t>(bb::avm2::MemoryTag::U8));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}

// NOT TESTS

TEST_P(AluTagTest, AluNotTest)
{
    const auto tag = GetParam();
    auto trace = process_not_trace_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTagTest, AluNotNegativeTest)
{
    const auto tag = GetParam();
    auto trace = process_not_trace_with_tracegen(tag);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);

    trace.set(Column::alu_ib, 0, trace.get(Column::alu_ib, 0) + 1); // Mutate output
    // If we use an FF input, the tag err is set automatically and gates NOT_OP_MAIN, so flip it back here:
    trace.set(Column::alu_sel_tag_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "NOT_OP_MAIN");
}

TEST_P(AluTagTest, AluNotTagError)
{
    const auto tag = GetParam();
    auto trace = process_not_trace_with_tracegen(tag, true);

    // Tag error for NOT means that the tag of a is FF:
    if (tag == MemoryTag::FF) {
        check_all_interactions<AluTraceBuilder>(trace);
        check_relation<alu>(trace);
    } else {
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    }
}

TEST(AluConstrainingTest, AluNegativeNotWrongOpId)
{
    auto trace = process_not_trace_with_tracegen(MemoryTag::U8);
    check_relation<alu>(trace);
    trace.set(Column::alu_op_id, 0, AVM_EXEC_OP_ID_ALU_EQ);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "OP_ID_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
