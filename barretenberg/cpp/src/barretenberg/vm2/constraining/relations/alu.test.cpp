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
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/alu.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using alu = bb::avm2::alu<FF>;
using tracegen::AluTraceBuilder;
using tracegen::ExecutionTraceBuilder;
using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::GreaterThanTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;

constexpr uint8_t NUM_OF_TAGS = static_cast<uint8_t>(MemoryTag::MAX) + 1;

// Generic structure for three-operand opcodes
using ThreeOperandTestParams = std::tuple<MemoryValue, MemoryValue, MemoryValue>;

// Generic structure for two-operand opcodes
using TwoOperandTestParams = std::tuple<MemoryValue, MemoryValue>;

const std::vector<std::tuple<MemoryValue, MemoryValue>> TEST_VALUES_IN = {
    {
        MemoryValue::from_tag(MemoryTag::U1, 1),
        MemoryValue::from_tag(MemoryTag::U1, 0),
    },
    {
        MemoryValue::from_tag(MemoryTag::U8, 200),
        MemoryValue::from_tag(MemoryTag::U8, 50),
    },
    {
        MemoryValue::from_tag(MemoryTag::U16, 30),
        MemoryValue::from_tag(MemoryTag::U16, 65500),
    },
    {
        MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 10),
        MemoryValue::from_tag(MemoryTag::U32, 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 10),
        MemoryValue::from_tag(MemoryTag::U64, 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 10),
        MemoryValue::from_tag(MemoryTag::U128, 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 4),
        MemoryValue::from_tag(MemoryTag::FF, 2),
    },
};

const std::unordered_map<MemoryTag, MemoryTag> TAG_ERROR_TEST_VALUES = {
    { MemoryTag::FF, MemoryTag::U8 },   { MemoryTag::U1, MemoryTag::U8 },   { MemoryTag::U8, MemoryTag::U16 },
    { MemoryTag::U16, MemoryTag::U32 }, { MemoryTag::U32, MemoryTag::U16 }, { MemoryTag::U64, MemoryTag::U128 },
    { MemoryTag::U128, MemoryTag::FF },
};

std::vector<ThreeOperandTestParams> zip_helper(const std::vector<MemoryValue>& out)
{
    std::vector<ThreeOperandTestParams> res;
    uint32_t i = 0;
    for (const auto c : out) {
        ThreeOperandTestParams params = tuple_cat(TEST_VALUES_IN.at(i), std::make_tuple(c));
        res.push_back(params);
        i++;
    }
    return res;
}

std::vector<TwoOperandTestParams> zip_helper_two_op(const std::vector<MemoryValue>& out)
{
    std::vector<TwoOperandTestParams> res;
    uint32_t i = 0;
    for (const auto c : out) {
        TwoOperandTestParams params = std::make_tuple(std::get<0>(TEST_VALUES_IN.at(i)), c);
        res.push_back(params);
        i++;
    }
    return res;
}

class AluConstrainingTest : public ::testing::Test {
  public:
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    AluTraceBuilder builder;
};

TEST_F(AluConstrainingTest, EmptyRow)
{
    check_relation<alu>(testing::empty_trace());
}

TEST_F(AluConstrainingTest, NegativeAluWrongOpId)
{
    auto trace = TestTraceContainer({
        {
            { C::alu_op_id, AVM_EXEC_OP_ID_ALU_ADD + 1 },
            { C::alu_sel_op_add, 1 },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_OP_ID_CHECK), "OP_ID_CHECK");
}

// ADD TESTS

const std::vector<MemoryValue> TEST_VALUES_ADD_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U8, 250),
    MemoryValue::from_tag(MemoryTag::U16, 65530),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 5),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 5),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 5),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 2),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_ADD = zip_helper(TEST_VALUES_ADD_OUT);

class AluAddConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_basic_add_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        auto tag = static_cast<uint8_t>(a.get_tag());
        auto trace = TestTraceContainer({
            {
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, get_tag_bits(a.get_tag()) },
                { C::alu_max_value, get_tag_max_value(a.get_tag()) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_ADD },
                { C::alu_sel, 1 },
                { C::alu_sel_op_add, 1 },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_ADD }, // = alu_op_id
            },
        });

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }

    TestTraceContainer process_basic_add_with_tracegen(ThreeOperandTestParams params, bool error = false)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;

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

    TestTraceContainer process_carry_add_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();
        b = MemoryValue::from_tag(mem_tag, get_tag_max_value(mem_tag));
        c = a - MemoryValue::from_tag(mem_tag, 1);
        auto tag = static_cast<uint8_t>(mem_tag);
        auto trace = TestTraceContainer({
            {
                { C::alu_cf, 1 },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, get_tag_bits(mem_tag) },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_ADD },
                { C::alu_sel, 1 },
                { C::alu_sel_op_add, 1 },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_ADD }, // = alu_op_id
            },
        });

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }

    TestTraceContainer process_carry_add_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();
        b = MemoryValue::from_tag(mem_tag, get_tag_max_value(mem_tag));
        c = a - MemoryValue::from_tag(mem_tag, 1);

        builder.process(
            {
                { .operation = simulation::AluOperation::ADD, .a = a, .b = b, .c = c },
            },
            trace);

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluAddConstrainingTest, ::testing::ValuesIn(TEST_VALUES_ADD));

TEST_P(AluAddConstrainingTest, AluBasicAdd)
{
    auto trace = process_basic_add_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluAddConstrainingTest, AluBasicAddTraceGen)
{
    auto trace = process_basic_add_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluAddConstrainingTest, AluCarryAdd)
{
    auto trace = process_carry_add_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluAddConstrainingTest, AluCarryAddTraceGen)
{
    auto trace = process_carry_add_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluAddConstrainingTest, NegativeBasicAdd)
{
    auto trace = process_basic_add_trace(GetParam());
    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, trace.get(Column::alu_ic, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD_SUB");
}

TEST_P(AluAddConstrainingTest, NegativeAluCarryAdd)
{
    auto params = GetParam();
    auto trace = process_carry_add_trace(params);
    auto correct_max_value = trace.get(Column::alu_max_value, 0);
    auto is_ff = std::get<0>(params).get_tag() == MemoryTag::FF;
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
    // We get the correct overflowed result 'for free' with FF whether cf is on or not
    if (!is_ff) {
        trace.set(Column::alu_cf, 0, 0);
        // If we are overflowing, we need to set the carry flag...
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD_SUB");

        trace.set(Column::alu_cf, 0, 1);
        trace.set(Column::alu_max_value, 0, 0);
        // ...and the correct max_value:
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD_SUB");
        EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_BITS_VALUE");
        trace.set(Column::alu_max_value, 0, correct_max_value);
    }

    // TODO(MW): The below should fail the range check on c in memory, but we cannot test this yet.
    // Instead, we assume the carry flag is correct and show an overflow fails:
    trace.set(Column::alu_ic, 0, correct_max_value + 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD_SUB");
}

TEST_P(AluAddConstrainingTest, NegativeAddWrongTagABMismatch)
{
    auto params = GetParam();
    auto tag = static_cast<uint8_t>(std::get<0>(params).get_tag());
    auto trace = process_basic_add_trace(params);
    trace.set(Column::alu_ib_tag, 0, tag - 1);
    // ab_tags_diff_inv = inv(a_tag - b_tag) = inv(1) = 1:
    trace.set(Column::alu_ab_tags_diff_inv, 0, 1);
    trace.set(Column::alu_sel_ab_tag_mismatch, 0, 1);
    // If we set the mismatch error, we need to make sure the ALU tag error selector is correct:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    trace.set(Column::alu_sel_tag_err, 0, 1);
    // If we set one error, we need to make sure the overall ALU error selector is correct:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ERR_CHECK");
    trace.set(Column::alu_sel_err, 0, 1);
    // Though the tags don't match, with error handling we can return the error rather than fail:
    check_relation<alu>(trace);
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    trace.set(Column::alu_ab_tags_diff_inv, 0, 1);
    // Correcting the inverse, but removing the error will fail:
    trace.set(Column::alu_sel_ab_tag_mismatch, 0, 0);
    trace.set(Column::alu_sel_tag_err, 0, 0);
    trace.set(Column::alu_sel_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

TEST_P(AluAddConstrainingTest, NegativeAddTraceGenWrongTagABMismatch)
{
    auto [a, b, c] = GetParam();
    auto trace = process_basic_add_with_tracegen(
        { a, MemoryValue::from_tag(TAG_ERROR_TEST_VALUES.at(b.get_tag()), b.as_ff()), c }, true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluAddConstrainingTest, NegativeAddWrongTagCMismatch)
{
    auto params = GetParam();
    auto tag = static_cast<uint8_t>(std::get<0>(params).get_tag());
    auto trace = process_basic_add_trace(params);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, tag - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}

// SUB TESTS

const std::vector<MemoryValue> TEST_VALUES_SUB_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U8, 150),
    MemoryValue::from_tag(MemoryTag::U16, 66),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 15),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 15),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 15),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 6),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_SUB = zip_helper(TEST_VALUES_SUB_OUT);

class AluSubConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_sub_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        auto tag = static_cast<uint8_t>(a.get_tag());
        auto trace = TestTraceContainer({
            {
                { C::alu_cf, a.as_ff() - b.as_ff() != c.as_ff() ? 1 : 0 },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, get_tag_bits(a.get_tag()) },
                { C::alu_max_value, get_tag_max_value(a.get_tag()) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_SUB },
                { C::alu_sel, 1 },
                { C::alu_sel_op_sub, 1 },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_SUB }, // = alu_op_id
            },
        });

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }

    TestTraceContainer process_sub_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;

        builder.process(
            {
                { .operation = simulation::AluOperation::SUB, .a = a, .b = b, .c = c },
            },
            trace);

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluSubConstrainingTest, ::testing::ValuesIn(TEST_VALUES_SUB));

TEST_P(AluSubConstrainingTest, AluSub)
{
    auto trace = process_sub_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluSubConstrainingTest, AluSubTraceGen)
{
    auto trace = process_sub_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluSubConstrainingTest, AluSubNegative)
{
    auto params = GetParam();
    auto is_ff = std::get<0>(params).get_tag() == MemoryTag::FF;
    auto trace = process_sub_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);

    auto c = trace.get(Column::alu_ic, 0);

    trace.set(Column::alu_ic, 0, c + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD_SUB");

    trace.set(Column::alu_ic, 0, c);
    check_relation<alu>(trace);

    // We get the correct underflowed result 'for free' with FF whether cf is on or not
    if (!is_ff) {
        trace.set(Column::alu_cf, 0, trace.get(Column::alu_cf, 0) == 1 ? 0 : 1);
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD_SUB");
    }
}

// MUL TESTS

const std::vector<MemoryValue> TEST_VALUES_MUL_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U8, 16),
    MemoryValue::from_tag(MemoryTag::U16, 64456),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 50),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 50),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 50),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 8),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_MUL = zip_helper(TEST_VALUES_MUL_OUT);

class AluMulConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_mul_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);

        auto is_u128 = mem_tag == MemoryTag::U128;

        auto c_int = static_cast<uint256_t>(a.as_ff()) * static_cast<uint256_t>(b.as_ff());
        auto c_hi = mem_tag == MemoryTag::FF ? 0 : c_int >> get_tag_bits(mem_tag);

        auto trace = TestTraceContainer({
            {
                { C::alu_c_hi, c_hi },
                { C::alu_constant_64, 64 },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, get_tag_bits(mem_tag) },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_MUL },
                { C::alu_sel, 1 },
                { C::alu_sel_decompose_a, is_u128 ? 1 : 0 },
                { C::alu_sel_is_u128, is_u128 ? 1 : 0 },
                { C::alu_sel_mul_div_u128, is_u128 ? 1 : 0 },
                { C::alu_sel_mul_u128, is_u128 ? 1 : 0 },
                { C::alu_sel_op_mul, 1 },
                { C::alu_tag_u128_diff_inv, is_u128 ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::U128)).invert() },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_MUL }, // = alu_op_id
            },
        });

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);

        if (is_u128) {
            auto a_decomp = simulation::decompose(a.as<uint128_t>());
            auto b_decomp = simulation::decompose(b.as<uint128_t>());
            // c_hi = old_c_hi - a_hi * b_hi % 2^64
            auto hi_operand = static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi);
            c_hi = (c_hi - hi_operand) % (uint256_t(1) << 64);
            trace.set(0,
                      { { { Column::alu_a_lo, a_decomp.lo },
                          { Column::alu_a_lo_bits, 64 },
                          { Column::alu_a_hi, a_decomp.hi },
                          { Column::alu_a_hi_bits, 64 },
                          { Column::alu_b_lo, b_decomp.lo },
                          { Column::alu_b_hi, b_decomp.hi },
                          { Column::alu_c_hi, c_hi },
                          { Column::alu_cf, hi_operand == 0 ? 0 : 1 } } });

            range_check_builder.process({ { .value = a_decomp.lo, .num_bits = 64 },
                                          { .value = a_decomp.hi, .num_bits = 64 },
                                          { .value = b_decomp.lo, .num_bits = 64 },
                                          { .value = b_decomp.hi, .num_bits = 64 },
                                          { .value = static_cast<uint128_t>(c_hi), .num_bits = 64 } },
                                        trace);
        }

        return trace;
    }

    TestTraceContainer process_mul_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();

        builder.process(
            {
                { .operation = simulation::AluOperation::MUL, .a = a, .b = b, .c = c },
            },
            trace);

        uint256_t a_int = static_cast<uint256_t>(a.as_ff());
        uint256_t b_int = static_cast<uint256_t>(b.as_ff());
        auto c_hi = mem_tag == MemoryTag::FF ? 0 : (a_int * b_int) >> get_tag_bits(mem_tag);
        if (mem_tag == MemoryTag::U128) {
            auto a_decomp = simulation::decompose(a.as<uint128_t>());
            auto b_decomp = simulation::decompose(b.as<uint128_t>());
            // c_hi = old_c_hi - a_hi * b_hi % 2^64
            auto hi_operand = static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi);
            c_hi = (c_hi - hi_operand) % (uint256_t(1) << 64);
            range_check_builder.process({ { .value = a_decomp.lo, .num_bits = 64 },
                                          { .value = a_decomp.hi, .num_bits = 64 },
                                          { .value = b_decomp.lo, .num_bits = 64 },
                                          { .value = b_decomp.hi, .num_bits = 64 },
                                          { .value = static_cast<uint128_t>(c_hi), .num_bits = 64 } },
                                        trace);
        } else {
            range_check_builder.process({ { .value = static_cast<uint128_t>(c_hi), .num_bits = 64 } }, trace);
        }
        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluMulConstrainingTest, ::testing::ValuesIn(TEST_VALUES_MUL));

TEST_P(AluMulConstrainingTest, AluMul)
{
    auto trace = process_mul_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluMulConstrainingTest, AluMulTraceGen)
{
    auto trace = process_mul_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_F(AluConstrainingTest, AluMulU128Carry)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, get_tag_max_value(MemoryTag::U128));     // = -1
    auto b = MemoryValue::from_tag(MemoryTag::U128, get_tag_max_value(MemoryTag::U128) - 2); // = -3
    auto c = a * b;                                                                          // = 3
    auto overflow_c_int = static_cast<uint256_t>(a.as_ff()) * static_cast<uint256_t>(b.as_ff());

    auto tag = static_cast<uint8_t>(MemoryTag::U128);

    auto a_decomp = simulation::decompose(a.as<uint128_t>());
    auto b_decomp = simulation::decompose(b.as<uint128_t>());

    // c_hi = old_c_hi - a_hi * b_hi % 2^64
    auto hi_operand = static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi);
    auto c_hi = ((overflow_c_int >> 128) - hi_operand) % (uint256_t(1) << 64);
    auto trace = TestTraceContainer({
        {
            { C::alu_a_hi, a_decomp.hi },
            { C::alu_a_hi_bits, 64 },
            { C::alu_a_lo, a_decomp.lo },
            { C::alu_a_lo_bits, 64 },
            { C::alu_b_hi, b_decomp.hi },
            { C::alu_b_lo, b_decomp.lo },
            { C::alu_c_hi, c_hi },
            { C::alu_cf, 1 }, // a * b overflows
            { C::alu_constant_64, 64 },
            { C::alu_ia, a },
            { C::alu_ia_tag, tag },
            { C::alu_ib, b },
            { C::alu_ib_tag, tag },
            { C::alu_ic, c },
            { C::alu_ic_tag, tag },
            { C::alu_max_bits, get_tag_bits(MemoryTag::U128) },
            { C::alu_max_value, get_tag_max_value(MemoryTag::U128) },
            { C::alu_op_id, AVM_EXEC_OP_ID_ALU_MUL },
            { C::alu_sel, 1 },
            { C::alu_sel_decompose_a, 1 },
            { C::alu_sel_is_u128, 1 },
            { C::alu_sel_mul_div_u128, 1 },
            { C::alu_sel_mul_u128, 1 },
            { C::alu_sel_op_mul, 1 },
            { C::alu_tag_u128_diff_inv, 0 },
            { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
            { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
            { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
            { C::execution_register_0_, a },                                // = ia
            { C::execution_register_1_, b },                                // = ib
            { C::execution_register_2_, c },                                // = ic
            { C::execution_sel_execute_alu, 1 },                            // = sel
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_MUL }, // = alu_op_id
        },
    });

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    range_check_builder.process({ { .value = a_decomp.lo, .num_bits = 64 },
                                  { .value = a_decomp.hi, .num_bits = 64 },
                                  { .value = b_decomp.lo, .num_bits = 64 },
                                  { .value = b_decomp.hi, .num_bits = 64 },
                                  { .value = static_cast<uint128_t>(c_hi), .num_bits = 64 } },
                                trace);

    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);

    // Below = (a * b mod p) mod 2^128
    auto should_fail_overflowed = MemoryValue::from_tag_truncating(MemoryTag::U128, a.as_ff() * b.as_ff());
    trace.set(Column::alu_ic, 0, should_fail_overflowed);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_MUL_U128");
}

TEST_P(AluMulConstrainingTest, NegativeAluMul)
{
    auto trace = process_mul_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, trace.get(Column::alu_ic, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_MUL");
}

// DIV TESTS

const std::vector<MemoryValue> TEST_VALUES_DIV_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0), // Dividing by zero, so expecting an error
    MemoryValue::from_tag(MemoryTag::U8, 4),
    MemoryValue::from_tag(MemoryTag::U16, 0),
    MemoryValue::from_tag(MemoryTag::U32, 0x33333331),
    MemoryValue::from_tag(MemoryTag::U64, 0x3333333333333331ULL),
    MemoryValue::from_tag(MemoryTag::U128, (((uint256_t(1) << 128) - 11) / 5)), // 0x3333333333333333333333333333331
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_DIV = zip_helper(TEST_VALUES_DIV_OUT);

class AluDivConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_div_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);
        auto remainder = a - b * c;

        auto div_0_error = b.as_ff() == FF(0);
        auto is_u128 = mem_tag == MemoryTag::U128;

        auto trace = TestTraceContainer({
            {
                { C::alu_b_inv, div_0_error ? 0 : b.as_ff().invert() },
                { C::alu_constant_64, 64 },
                { C::alu_helper1, div_0_error ? 0 : remainder.as_ff() },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, get_tag_bits(mem_tag) },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_DIV },
                { C::alu_sel, 1 },
                { C::alu_sel_decompose_a, is_u128 ? 1 : 0 },
                { C::alu_sel_div_0_err, div_0_error ? 1 : 0 },
                { C::alu_sel_div_no_0_err, div_0_error ? 0 : 1 },
                { C::alu_sel_err, div_0_error ? 1 : 0 },
                { C::alu_sel_is_u128, is_u128 ? 1 : 0 },
                { C::alu_sel_mul_div_u128, is_u128 ? 1 : 0 },
                { C::alu_sel_op_div, 1 },
                { C::alu_tag_ff_diff_inv, FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert() },
                { C::alu_tag_u128_diff_inv, is_u128 ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::U128)).invert() },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_sel_opcode_error, div_0_error ? 1 : 0 },         // = sel_err
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_DIV }, // = alu_op_id
            },
        });

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        gt_builder.process({ { .a = static_cast<uint128_t>(b.as_ff()),
                               .b = static_cast<uint128_t>(remainder.as_ff()),
                               .result = true } },
                           trace);

        if (is_u128) {
            auto c_decomp = simulation::decompose(c.as<uint128_t>());
            auto b_decomp = simulation::decompose(b.as<uint128_t>());

            trace.set(0,
                      { { { Column::alu_a_lo, c_decomp.lo },
                          { Column::alu_a_lo_bits, 64 },
                          { Column::alu_a_hi, c_decomp.hi },
                          { Column::alu_a_hi_bits, 64 },
                          { Column::alu_b_lo, b_decomp.lo },
                          { Column::alu_b_hi, b_decomp.hi } } });

            range_check_builder.process({ { .value = c_decomp.lo, .num_bits = 64 },
                                          { .value = c_decomp.hi, .num_bits = 64 },
                                          { .value = b_decomp.lo, .num_bits = 64 },
                                          { .value = b_decomp.hi, .num_bits = 64 } },
                                        trace);
        }

        return trace;
    }

    TestTraceContainer process_div_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        bool div_0_error = b.as_ff() == FF(0);
        auto mem_tag = a.get_tag();
        auto remainder = a - b * c;

        builder.process(
            {
                { .operation = simulation::AluOperation::DIV,
                  .a = a,
                  .b = b,
                  .c = c,
                  .error = div_0_error ? std::make_optional(simulation::AluError::DIV_0_ERROR) : std::nullopt },
            },
            trace);

        if (mem_tag == MemoryTag::U128) {
            auto c_decomp = simulation::decompose(c.as<uint128_t>());
            auto b_decomp = simulation::decompose(b.as<uint128_t>());

            range_check_builder.process({ { .value = c_decomp.lo, .num_bits = 64 },
                                          { .value = c_decomp.hi, .num_bits = 64 },
                                          { .value = b_decomp.lo, .num_bits = 64 },
                                          { .value = b_decomp.hi, .num_bits = 64 } },
                                        trace);
        }
        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        gt_builder.process({ { .a = static_cast<uint128_t>(b.as_ff()),
                               .b = static_cast<uint128_t>(remainder.as_ff()),
                               .result = true } },
                           trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluDivConstrainingTest, ::testing::ValuesIn(TEST_VALUES_DIV));

TEST_P(AluDivConstrainingTest, AluDiv)
{
    auto trace = process_div_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluDivConstrainingTest, AluDivTraceGen)
{
    auto trace = process_div_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_F(AluDivConstrainingTest, NegativeAluDivUnderflow)
{
    // Test that for a < b, the circuit does not accept c != 0
    auto a = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 5);
    auto c = a / b;
    auto trace = process_div_trace({ a, b, c });
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);

    // Good path: 2/5 gives 0 with remainder = 2
    // Bad path: 5 * c = 2 - r => set c = 2, so r = p - 8:

    c = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto wrong_remainder = a.as_ff() - b.as_ff() * c.as_ff();

    trace.set(Column::alu_ic, 0, c);
    trace.set(Column::alu_helper1, 0, wrong_remainder);

    // All relations will pass...
    check_relation<alu>(trace);
    // ... but now r > b, so the gt lookup will fail:
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_GT_DIV_REMAINDER");
}

TEST_F(AluDivConstrainingTest, NegativeAluDivU128Carry)
{
    // Test that for a < b, the circuit does not accept c != 0
    auto a = MemoryValue::from_tag(MemoryTag::U128, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 64) + 2);
    auto c = a / b;

    auto trace = process_div_trace({ a, b, c });

    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);

    // Check we cannot provide a c s.t. a - r = b * c over/underflows

    c = MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 64) + 3);
    auto wrong_remainder = a.as_ff() - FF(static_cast<uint256_t>(b.as_ff()) * static_cast<uint256_t>(c.as_ff()));

    // We now have c and wrong_remainder s.t. a - wrong_remainder == b * c in the field...

    trace.set(Column::alu_ic, 0, c);
    trace.set(Column::alu_helper1, 0, wrong_remainder);

    // ...but we haven't provided a correct decomposition of the new bad c:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DECOMPOSITION");

    auto c_decomp = simulation::decompose(c.as<uint128_t>());
    trace.set(Column::alu_a_lo, 0, c_decomp.lo);
    trace.set(Column::alu_a_hi, 0, c_decomp.hi);

    // Setting the decomposed values still (correctly) fails:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_DIV_U128");
}

TEST_F(AluDivConstrainingTest, NegativeAluDivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 5);
    auto c = a / b;

    for (const bool with_tracegen : { false, true }) {
        auto trace = with_tracegen ? process_div_with_tracegen({ a, b, c }) : process_div_trace({ a, b, c });
        check_all_interactions<AluTraceBuilder>(trace);
        check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
        check_relation<alu>(trace);

        // Set b, b_inv to 0...
        trace.set(Column::alu_ib, 0, 0);
        trace.set(Column::alu_b_inv, 0, 0);
        // ...and since we haven't set the error correctly, we expect the below to fail:
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
        // We need to set the div_0_err and...
        trace.set(Column::alu_sel_div_0_err, 0, 1);
        trace.set(Column::alu_sel_div_no_0_err, 0, 0);
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ERR_CHECK");
        // ...the overall sel_err:
        trace.set(Column::alu_sel_err, 0, 1);
        check_relation<alu>(trace);

        // If we try and have div_0_err on without doing a div, the below should fail:
        trace.set(Column::alu_sel_op_div, 0, 0);
        trace.set(Column::alu_sel_op_mul, 0, 1);
        trace.set(Column::alu_op_id, 0, AVM_EXEC_OP_ID_ALU_MUL);
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");

        trace.set(Column::alu_sel_op_div, 0, 1);
        trace.set(Column::alu_sel_op_mul, 0, 0);
        trace.set(Column::alu_op_id, 0, AVM_EXEC_OP_ID_ALU_DIV);
        check_relation<alu>(trace);

        // If we try and set b != 0 with div_0_err on, the below should fail:
        trace.set(Column::alu_ib, 0, b);
        trace.set(Column::alu_b_inv, 0, b.as_ff().invert());
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
    }
}

TEST_F(AluDivConstrainingTest, NegativeAluDivFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 5);
    auto c = a / b;
    auto trace = process_div_with_tracegen({ a, b, c });
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    // This case should be recoverable, so we set the tag err selectors:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

TEST_F(AluDivConstrainingTest, NegativeAluDivByZeroFF)
{
    // For DIV, we can have both FF and dividing by zero errors:
    auto a = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 5);
    auto c = a / b;
    auto trace = process_div_with_tracegen({ a, b, c });
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    // Set b, b_inv to 0 with dividing by 0 errors:
    trace.set(Column::alu_ib, 0, 0);
    trace.set(Column::alu_b_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
    trace.set(Column::alu_sel_div_0_err, 0, 1);
    trace.set(Column::alu_sel_div_no_0_err, 0, 0);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

TEST_F(AluDivConstrainingTest, NegativeAluDivByZeroFFTagMismatch)
{
    // For DIV, we can have FF, tag mismatch, and dividing by zero errors:
    auto a = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 5);
    auto c = a / b;
    auto trace = process_div_with_tracegen({ a, b, c });
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    // Setting b to u8 also creates a tag mismatch:
    trace.set(Column::alu_ib_tag, 0, static_cast<uint8_t>(MemoryTag::U8));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    trace.set(Column::alu_sel_ab_tag_mismatch, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv,
              0,
              (FF(static_cast<uint8_t>(MemoryTag::FF)) - FF(static_cast<uint8_t>(MemoryTag::U8))).invert());
    check_relation<alu>(trace);
    // We can also handle dividing by 0:
    trace.set(Column::alu_ib, 0, 0);
    trace.set(Column::alu_b_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
    trace.set(Column::alu_sel_div_0_err, 0, 1);
    trace.set(Column::alu_sel_div_no_0_err, 0, 0);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

// FDIV TESTS

// Note: The test framework below converts all inputs to FF values to allow for many happy path tests without adding
// new vectors. Non-FF values are tested separately.
const std::vector<MemoryValue> TEST_VALUES_FDIV_OUT = {
    MemoryValue::from_tag(MemoryTag::FF, 0), // Dividing by zero, so expecting an error
    MemoryValue::from_tag(MemoryTag::FF, 4),
    MemoryValue::from_tag(MemoryTag::FF, FF("0x1e980ebbc51694827ee20074ac28b250a037a43eb44b38e6aa367c57a05e6d48")),
    MemoryValue::from_tag(MemoryTag::FF, FF("0x135b52945a13d9aa49b9b57c33cd568ba9ae5ce9ca4a2d06e7f3fbd4f9999998")),
    MemoryValue::from_tag(MemoryTag::FF, FF("0x135b52945a13d9aa49b9b57c33cd568ba9ae5ce9ca4a2d071b272f07f9999998")),
    MemoryValue::from_tag(MemoryTag::FF, FF("0x135b52945a13d9aa49b9b57c33cd568bdce1901cfd7d603a1b272f07f9999998")),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 2),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_FDIV = zip_helper(TEST_VALUES_FDIV_OUT);

class AluFDivConstrainingTest : public AluConstrainingTest,
                                public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_fdiv_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        a = MemoryValue::from_tag(MemoryTag::FF, a);
        b = MemoryValue::from_tag(MemoryTag::FF, b);
        c = MemoryValue::from_tag(MemoryTag::FF, c);
        auto div_0_error = b.as_ff() == FF(0);

        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);

        auto trace = TestTraceContainer({
            {
                { C::alu_b_inv, div_0_error ? 0 : b.as_ff().invert() },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, get_tag_bits(mem_tag) },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_FDIV },
                { C::alu_sel, 1 },
                { C::alu_sel_div_0_err, div_0_error ? 1 : 0 },
                { C::alu_sel_err, div_0_error ? 1 : 0 },
                { C::alu_sel_is_ff, 1 },
                { C::alu_sel_op_fdiv, 1 },
                { C::execution_mem_tag_reg_0_, tag },                            // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                            // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                            // = ic_tag
                { C::execution_register_0_, a },                                 // = ia
                { C::execution_register_1_, b },                                 // = ib
                { C::execution_register_2_, c },                                 // = ic
                { C::execution_sel_execute_alu, 1 },                             // = sel
                { C::execution_sel_opcode_error, div_0_error ? 1 : 0 },          // = sel_err
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_FDIV }, // = alu_op_id
            },
        });

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);

        return trace;
    }

    TestTraceContainer process_fdiv_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        a = MemoryValue::from_tag(MemoryTag::FF, a);
        b = MemoryValue::from_tag(MemoryTag::FF, b);
        c = MemoryValue::from_tag(MemoryTag::FF, c);
        bool div_0_error = b.as_ff() == FF(0);

        builder.process(
            {
                { .operation = simulation::AluOperation::FDIV,
                  .a = a,
                  .b = b,
                  .c = c,
                  .error = div_0_error ? std::make_optional(simulation::AluError::DIV_0_ERROR) : std::nullopt },
            },
            trace);

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);

        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluFDivConstrainingTest, ::testing::ValuesIn(TEST_VALUES_FDIV));

TEST_P(AluFDivConstrainingTest, AluFDiv)
{
    auto trace = process_fdiv_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluFDivConstrainingTest, AluFDivTraceGen)
{
    auto trace = process_fdiv_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_F(AluFDivConstrainingTest, NegativeAluFDivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 5);
    auto c = a / b;
    auto trace = process_fdiv_trace({ a, b, c });
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);

    // Set b, b_inv to 0...
    trace.set(Column::alu_ib, 0, 0);
    trace.set(Column::alu_b_inv, 0, 0);
    // ...and since we haven't set the error correctly, we expect the below to fail:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
    // We need to set the div_0_err and...
    trace.set(Column::alu_sel_div_0_err, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ERR_CHECK");
    // ...the overall sel_err:
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);

    // If we try and set b != 0 with div_0_err on, the below should fail:
    trace.set(Column::alu_ib, 0, b);
    trace.set(Column::alu_b_inv, 0, b.as_ff().invert());
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
}

TEST_F(AluFDivConstrainingTest, NegativeAluFDivByZeroNonFFTagMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U8, 4);
    auto b = MemoryValue::from_tag(MemoryTag::U8, 2);
    // An incorrect c_tag fails the relation rather than throwing a tag error - we want to test the throw here, so
    // setting c to be the correct tag:
    auto c = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto tag = static_cast<uint8_t>(MemoryTag::U8);

    auto trace = TestTraceContainer({
        {
            { C::alu_b_inv, b.as_ff().invert() },
            { C::alu_ia, a },
            { C::alu_ia_tag, tag },
            { C::alu_ib, b },
            { C::alu_ib_tag, tag },
            { C::alu_ic, c },
            { C::alu_ic_tag, static_cast<uint8_t>(MemoryTag::FF) },
            { C::alu_max_bits, get_tag_bits(MemoryTag::U8) },
            { C::alu_max_value, get_tag_max_value(MemoryTag::U8) },
            { C::alu_op_id, AVM_EXEC_OP_ID_ALU_FDIV },
            { C::alu_sel, 1 },
            { C::alu_sel_op_fdiv, 1 },
            { C::execution_mem_tag_reg_0_, tag },                                 // = ia_tag
            { C::execution_mem_tag_reg_1_, tag },                                 // = ib_tag
            { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::FF) }, // = ic_tag
            { C::execution_register_0_, a },                                      // = ia
            { C::execution_register_1_, b },                                      // = ib
            { C::execution_register_2_, c },                                      // = ic
            { C::execution_sel_execute_alu, 1 },                                  // = sel
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_FDIV },      // = alu_op_id
        },
    });

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_IS_FF");
    // We check sel_is_ff for FDIV so must correctly set the tag diff inverse:
    trace.set(Column::alu_tag_ff_diff_inv, 0, FF(FF(tag) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert());
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    // This case should be recoverable, so we set the tag err selectors:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    trace.set(Column::execution_sel_opcode_error, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);

    // For FDIV, we can have both FF and dividing by zero errors:
    trace.set(Column::alu_ib, 0, 0);
    trace.set(Column::alu_b_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "DIV_0_ERR");
    trace.set(Column::alu_sel_div_0_err, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    trace.set(Column::execution_register_1_, 0, 0);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);

    // Setting b to u16 also creates a tag mismatch we can handle with the same selectors:
    trace.set(Column::alu_ib_tag, 0, static_cast<uint8_t>(MemoryTag::U16));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    trace.set(Column::alu_sel_ab_tag_mismatch, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, (FF(tag) - FF(static_cast<uint8_t>(MemoryTag::U16))).invert());
    check_relation<alu>(trace);
}

// EQ TESTS

const std::vector<MemoryValue> TEST_VALUES_EQ_OUT(NUM_OF_TAGS, MemoryValue::from_tag(MemoryTag::U1, 0));

const std::vector<ThreeOperandTestParams> TEST_VALUES_EQ = zip_helper(TEST_VALUES_EQ_OUT);

class AluEQConstrainingTest : public AluConstrainingTest, public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_eq_with_tracegen(const ThreeOperandTestParams& params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;

        builder.process(
            {
                { .operation = simulation::AluOperation::EQ, .a = a, .b = b, .c = c },
            },
            trace);

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluEQConstrainingTest, ::testing::ValuesIn(TEST_VALUES_EQ));

TEST_P(AluEQConstrainingTest, AluEQTraceGen)
{
    const MemoryValue& param = std::get<0>(GetParam());
    auto trace =
        process_eq_with_tracegen(ThreeOperandTestParams{ param, param, MemoryValue::from_tag(MemoryTag::U1, 1) });
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluEQConstrainingTest, AluInEQTraceGen)
{
    auto trace = process_eq_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluEQConstrainingTest, NegativeAluEqResult)
{
    auto params = GetParam();
    for (const bool is_eq : { false, true }) {
        auto trace = process_eq_with_tracegen(is_eq ? ThreeOperandTestParams{ std::get<0>(params),
                                                                              std::get<0>(params),
                                                                              MemoryValue::from_tag(MemoryTag::U1, 1) }
                                                    : params);
        check_relation<alu>(trace);
        check_all_interactions<AluTraceBuilder>(trace);
        check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
        bool c = trace.get(Column::alu_ic, 0) == 1;
        // Swap the result bool:
        trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "EQ_OP_MAIN");
    }
}

TEST_P(AluEQConstrainingTest, NegativeAluEqHelper)
{
    auto trace = process_eq_with_tracegen(GetParam());
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    auto helper = trace.get(Column::alu_helper1, 0);
    trace.set(Column::alu_helper1, 0, helper + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "EQ_OP_MAIN");
}

// LT TESTS

const std::vector<MemoryValue> TEST_VALUES_LT_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_LT = zip_helper(TEST_VALUES_LT_OUT);

class AluLTConstrainingTest : public AluConstrainingTest, public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_lt_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);
        auto is_ff = mem_tag == MemoryTag::FF;

        auto trace = TestTraceContainer({
            {
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, static_cast<uint8_t>(MemoryTag::U1) },
                { C::alu_lt_ops_input_a, b },
                { C::alu_lt_ops_input_b, a },
                { C::alu_lt_ops_result_c, c },
                { C::alu_max_bits, get_tag_bits(mem_tag) },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_LT },
                { C::alu_sel, 1 },
                { C::alu_sel_ff_lt_ops, static_cast<uint8_t>(is_ff) },
                { C::alu_sel_int_lt_ops, static_cast<uint8_t>(!is_ff) },
                { C::alu_sel_is_ff, static_cast<uint8_t>(is_ff) },
                { C::alu_sel_lt_ops, 1 },
                { C::alu_sel_op_lt, 1 },
                { C::alu_tag_ff_diff_inv, is_ff ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert() },
                { C::execution_mem_tag_reg_0_, tag },                                 // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                                 // = ib_tag
                { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) }, // = ic_tag
                { C::execution_register_0_, a },                                      // = ia
                { C::execution_register_1_, b },                                      // = ib
                { C::execution_register_2_, c },                                      // = ic
                { C::execution_sel_execute_alu, 1 },                                  // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_LT },        // = alu_op_id
            },
        });

        if (is_ff) {
            field_gt_builder.process({ { .a = b, .b = a, .gt_result = c.as_ff() == 1 } }, trace);
        } else {
            gt_builder.process({ { .a = static_cast<uint128_t>(b.as_ff()),
                                   .b = static_cast<uint128_t>(a.as_ff()),
                                   .result = c.as_ff() == 1 } },
                               trace);
        }

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }

    TestTraceContainer process_lt_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        auto is_ff = a.get_tag() == MemoryTag::FF;

        builder.process(
            {
                { .operation = simulation::AluOperation::LT, .a = a, .b = b, .c = c },
            },
            trace);

        if (is_ff) {
            field_gt_builder.process({ { .a = b, .b = a, .gt_result = c.as_ff() == 1 } }, trace);
        } else {
            gt_builder.process({ { .a = static_cast<uint128_t>(b.as_ff()),
                                   .b = static_cast<uint128_t>(a.as_ff()),
                                   .result = c.as_ff() == 1 } },
                               trace);
        }
        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluLTConstrainingTest, ::testing::ValuesIn(TEST_VALUES_LT));

TEST_P(AluLTConstrainingTest, AluLT)
{
    auto trace = process_lt_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluLTConstrainingTest, AluLTTraceGen)
{
    auto trace = process_lt_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluLTConstrainingTest, NegativeAluLT)
{
    auto params = GetParam();
    auto trace = process_lt_trace(params);
    auto is_ff = std::get<0>(params).get_tag() == MemoryTag::FF;
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    bool c = trace.get(Column::alu_ic, 0) == 1;
    // Swap the result bool:
    trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "LTE_NEGATE_RESULT_C");
    trace.set(Column::alu_lt_ops_result_c, 0, static_cast<uint8_t>(!c));

    if (is_ff) {
        EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_ff_gt_settings>(trace)),
                                  "LOOKUP_ALU_FF_GT");
    } else {
        EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_int_gt_settings>(trace)),
                                  "LOOKUP_ALU_INT_GT");
    }
}

// LTE TESTS

const std::vector<ThreeOperandTestParams> TEST_VALUES_LTE = zip_helper(TEST_VALUES_LT_OUT);

class AluLTEConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_lte_trace(ThreeOperandTestParams params, bool eq = false)
    {
        auto [a, b, c] = params;
        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);
        auto is_ff = mem_tag == MemoryTag::FF;
        b = eq ? a : b;
        c = eq ? MemoryValue::from_tag(MemoryTag::U1, 1) : c;

        auto trace = TestTraceContainer({
            {
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, static_cast<uint8_t>(MemoryTag::U1) },
                { C::alu_lt_ops_input_a, a },
                { C::alu_lt_ops_input_b, b },
                { C::alu_lt_ops_result_c, c.as_ff() == 0 ? 1 : 0 },
                { C::alu_max_bits, get_tag_bits(mem_tag) },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_LTE },
                { C::alu_sel, 1 },
                { C::alu_sel_ff_lt_ops, static_cast<uint8_t>(is_ff) },
                { C::alu_sel_int_lt_ops, static_cast<uint8_t>(!is_ff) },
                { C::alu_sel_is_ff, static_cast<uint8_t>(is_ff) },
                { C::alu_sel_lt_ops, 1 },
                { C::alu_sel_op_lte, 1 },
                { C::alu_tag_ff_diff_inv, is_ff ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert() },
                { C::execution_mem_tag_reg_0_, tag },                                 // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                                 // = ib_tag
                { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) }, // = ic_tag
                { C::execution_register_0_, a },                                      // = ia
                { C::execution_register_1_, b },                                      // = ib
                { C::execution_register_2_, c },                                      // = ic
                { C::execution_sel_execute_alu, 1 },                                  // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_LTE },       // = alu_op_id
            },
        });

        if (is_ff) {
            field_gt_builder.process({ { .a = a, .b = b, .gt_result = c.as_ff() == 0 } }, trace);
        } else {
            gt_builder.process({ { .a = static_cast<uint128_t>(a.as_ff()),
                                   .b = static_cast<uint128_t>(b.as_ff()),
                                   .result = c.as_ff() == 0 } },
                               trace);
        }
        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }

    TestTraceContainer process_lte_with_tracegen(ThreeOperandTestParams params, bool eq = false)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        auto is_ff = a.get_tag() == MemoryTag::FF;
        b = eq ? a : b;
        c = eq ? MemoryValue::from_tag(MemoryTag::U1, 1) : c;

        builder.process(
            {
                { .operation = simulation::AluOperation::LTE, .a = a, .b = b, .c = c },
            },
            trace);

        if (is_ff) {
            field_gt_builder.process({ { .a = a, .b = b, .gt_result = c.as_ff() == 0 } }, trace);
        } else {
            gt_builder.process({ { .a = static_cast<uint128_t>(a.as_ff()),
                                   .b = static_cast<uint128_t>(b.as_ff()),
                                   .result = c.as_ff() == 0 } },
                               trace);
        }
        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluLTEConstrainingTest, ::testing::ValuesIn(TEST_VALUES_LTE));

TEST_P(AluLTEConstrainingTest, AluLTE)
{
    auto trace = process_lte_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluLTEConstrainingTest, AluLTEEq)
{
    auto trace = process_lte_trace(GetParam(), true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluLTEConstrainingTest, AluLTETraceGen)
{
    auto trace = process_lte_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluLTEConstrainingTest, AluLTEEqTraceGen)
{
    auto trace = process_lte_with_tracegen(GetParam(), true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluLTEConstrainingTest, NegativeAluLTEResult)
{
    auto params = GetParam();

    for (const bool is_eq : { false, true }) {
        auto trace = process_lte_trace(params, is_eq);
        auto is_ff = std::get<0>(params).get_tag() == MemoryTag::FF;
        check_relation<alu>(trace);
        check_all_interactions<AluTraceBuilder>(trace);
        check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
        bool c = trace.get(Column::alu_ic, 0) == 1;
        // Swap the result bool:
        trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "LTE_NEGATE_RESULT_C");
        trace.set(Column::alu_lt_ops_result_c, 0, static_cast<uint8_t>(c));

        if (is_ff) {
            EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_ff_gt_settings>(trace)),
                                      "LOOKUP_ALU_FF_GT");
        } else {
            EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_int_gt_settings>(trace)),
                                      "LOOKUP_ALU_INT_GT");
        }
    }
}

TEST_P(AluLTEConstrainingTest, NegativeAluLTEInput)
{
    auto params = GetParam();

    for (const bool is_eq : { false, true }) {
        auto trace = process_lte_trace(params, is_eq);
        auto is_ff = std::get<0>(params).get_tag() == MemoryTag::FF;
        check_relation<alu>(trace);
        check_all_interactions<AluTraceBuilder>(trace);
        check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
        bool c = trace.get(Column::alu_ic, 0) == 1;
        auto a = trace.get(Column::alu_ia, 0);
        auto wrong_b = c ? a - 1 : a + 1;
        trace.set(Column::alu_ib, 0, wrong_b);
        trace.set(Column::alu_lt_ops_input_b, 0, wrong_b);
        // We rely on lookups, so we expect the relations to still pass...
        check_relation<alu>(trace);

        // ... but the lookup will fail (TODO(MW): properly add a gt and => range check events so it fails because c
        // is wrong, rather than because this test has not processed the events):
        if (is_ff) {
            EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_ff_gt_settings>(trace)),
                                      "LOOKUP_ALU_FF_GT");
        } else {
            EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_int_gt_settings>(trace)),
                                      "LOOKUP_ALU_INT_GT");
        }
    }
}

// NOT Opcode TESTS

const std::vector<MemoryValue> TEST_VALUES_NOT_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U8, 55),
    MemoryValue::from_tag(MemoryTag::U16, 65505),
    MemoryValue::from_tag(MemoryTag::U32, 9),
    MemoryValue::from_tag(MemoryTag::U64, 9),
    MemoryValue::from_tag(MemoryTag::U128, 9),
    MemoryValue::from_tag(static_cast<MemoryTag>(0), 0), // For FF, b is the default value of 0 with tag 0
};

const std::vector<TwoOperandTestParams> TEST_VALUES_NOT = zip_helper_two_op(TEST_VALUES_NOT_OUT);

class AluNotConstrainingTest : public AluConstrainingTest, public ::testing::WithParamInterface<TwoOperandTestParams> {
  public:
    TestTraceContainer process_not_with_tracegen(const TwoOperandTestParams& params, bool error = false)
    {
        TestTraceContainer trace;
        auto [a, b] = params;
        auto is_ff = a.get_tag() == MemoryTag::FF;

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
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluNotConstrainingTest, ::testing::ValuesIn(TEST_VALUES_NOT));

TEST_P(AluNotConstrainingTest, AluNotTraceGen)
{
    auto trace = process_not_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluNotConstrainingTest, NegativeAluNotTraceGen)
{
    auto params = GetParam();
    auto trace = process_not_with_tracegen(params);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_ib, 0, trace.get(Column::alu_ib, 0) + 1); // Mutate output
    // The FF case <==> tag_err for NOT, so NOT_OP_MAIN is gated:
    if (std::get<0>(params).get_tag() != MemoryTag::FF) {
        EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "NOT_OP_MAIN");
    }
}

TEST_P(AluNotConstrainingTest, AluNotTraceGenTagError)
{
    auto [a, b] = GetParam();
    auto trace = process_not_with_tracegen(
        TwoOperandTestParams{ a, MemoryValue::from_tag(TAG_ERROR_TEST_VALUES.at(b.get_tag()), b.as_ff()) }, true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

// SHL TESTS

const std::vector<MemoryValue> TEST_VALUES_SHL_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U8, 0),
    MemoryValue::from_tag(MemoryTag::U16, 0),
    MemoryValue::from_tag(MemoryTag::U32, 0xfffffec0),
    MemoryValue::from_tag(MemoryTag::U64, 0xfffffffffffffec0ULL),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 320), // 0xfffffffffffffffffffffffffffffec0
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_SHL = zip_helper(TEST_VALUES_SHL_OUT);

class AluShlConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_shl_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;

        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);
        auto tag_bits = get_tag_bits(mem_tag);
        auto a_num = static_cast<uint128_t>(a.as_ff());
        auto b_num = static_cast<uint128_t>(b.as_ff());

        auto overflow = b_num > tag_bits;
        uint128_t shift_lo_bits = overflow ? tag_bits : tag_bits - b_num;
        uint128_t shift_hi_bits = overflow ? tag_bits : b_num;
        auto two_pow_shift_lo_bits = static_cast<uint128_t>(1) << shift_lo_bits;
        auto a_lo = overflow ? b_num - tag_bits : a_num % two_pow_shift_lo_bits;
        auto a_hi = a_num >> shift_lo_bits;

        auto trace = TestTraceContainer({
            {
                { C::alu_a_hi, a_hi },
                { C::alu_a_hi_bits, shift_hi_bits },
                { C::alu_a_lo, a_lo },
                { C::alu_a_lo_bits, shift_lo_bits },
                { C::alu_helper1, static_cast<uint128_t>(1) << b_num },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, tag_bits },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_SHL },
                { C::alu_sel, 1 },
                { C::alu_sel_decompose_a, 1 },
                { C::alu_sel_op_shl, 1 },
                { C::alu_sel_shift_ops, 1 },
                { C::alu_sel_shift_ops_no_overflow, overflow ? 0 : 1 },
                { C::alu_shift_lo_bits, shift_lo_bits },
                { C::alu_tag_ff_diff_inv, FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert() },
                { C::alu_two_pow_shift_lo_bits, two_pow_shift_lo_bits },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_SHL }, // = alu_op_id

            },
        });

        precomputed_builder.process_misc(trace, std::max(NUM_OF_TAGS, static_cast<uint8_t>(shift_lo_bits + 1)));
        precomputed_builder.process_tag_parameters(trace);
        precomputed_builder.process_power_of_2(trace);
        range_check_builder.process({ { .value = a_lo, .num_bits = static_cast<uint8_t>(shift_lo_bits) },
                                      { .value = a_hi, .num_bits = static_cast<uint8_t>(shift_hi_bits) } },
                                    trace);

        return trace;
    }

    TestTraceContainer process_shl_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        auto b_num = static_cast<uint128_t>(b.as_ff());
        auto tag_bits = get_tag_bits(a.get_tag());
        auto overflow = b_num > tag_bits;
        uint128_t shift_lo_bits = overflow ? tag_bits : tag_bits - b_num;
        auto a_lo = overflow ? b_num - tag_bits
                             : static_cast<uint128_t>(a.as_ff()) % (static_cast<uint128_t>(1) << shift_lo_bits);

        builder.process(
            {
                { .operation = simulation::AluOperation::SHL, .a = a, .b = b, .c = c },
            },
            trace);

        precomputed_builder.process_misc(trace, std::max(NUM_OF_TAGS, static_cast<uint8_t>(shift_lo_bits + 1)));
        precomputed_builder.process_tag_parameters(trace);
        precomputed_builder.process_power_of_2(trace);
        range_check_builder.process({ { .value = a_lo, .num_bits = static_cast<uint8_t>(shift_lo_bits) },
                                      { .value = static_cast<uint128_t>(a.as_ff()) >> shift_lo_bits,
                                        .num_bits = static_cast<uint8_t>(overflow ? tag_bits : b_num) } },
                                    trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluShlConstrainingTest, ::testing::ValuesIn(TEST_VALUES_SHL));

TEST_P(AluShlConstrainingTest, AluShl)
{
    auto trace = process_shl_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluShlConstrainingTest, AluShlTraceGen)
{
    auto trace = process_shl_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_F(AluShlConstrainingTest, NegativeAluShlFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 5);
    auto c = MemoryValue::from_tag(MemoryTag::FF, 2 << 5);
    auto trace = process_shl_with_tracegen({ a, b, c });
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    // This case should be recoverable, so we set the tag err selectors:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    // Check the edge case of FF tag (=> max_bits = 0) and b = 0:
    trace.set(Column::alu_ib, 0, 0);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

TEST_F(AluShlConstrainingTest, NegativeAluShlTagMismatchOverflow)
{
    auto a = MemoryValue::from_tag(MemoryTag::U8, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 256);
    auto c = MemoryValue::from_tag(MemoryTag::U8, 0);
    auto trace = process_shl_with_tracegen({ a, b, c });
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    trace.set(Column::alu_sel_ab_tag_mismatch, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv,
              0,
              (FF(static_cast<uint8_t>(MemoryTag::U8)) - FF(static_cast<uint8_t>(MemoryTag::U32))).invert());
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    // This case should be recoverable, so we set the tag err selectors:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

// SHR TESTS

const std::vector<MemoryValue> TEST_VALUES_SHR_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U8, 0),
    MemoryValue::from_tag(MemoryTag::U16, 0),
    MemoryValue::from_tag(MemoryTag::U32, 0x7ffffff),
    MemoryValue::from_tag(MemoryTag::U64, 0x7ffffffffffffffULL),
    MemoryValue::from_tag(MemoryTag::U128,
                          (uint256_t(1) << 128) - 1 - (uint256_t(248) << 120)), // 0x7ffffffffffffffffffffffffffffff
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_SHR = zip_helper(TEST_VALUES_SHR_OUT);

class AluShrConstrainingTest : public AluConstrainingTest,
                               public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_shr_trace(ThreeOperandTestParams params)
    {
        auto [a, b, c] = params;

        auto mem_tag = a.get_tag();
        auto tag = static_cast<uint8_t>(mem_tag);
        auto tag_bits = get_tag_bits(mem_tag);
        auto a_num = static_cast<uint128_t>(a.as_ff());
        auto b_num = static_cast<uint128_t>(b.as_ff());

        auto overflow = b_num > tag_bits;
        uint128_t shift_lo_bits = overflow ? tag_bits : b_num;
        uint128_t shift_hi_bits = overflow ? tag_bits : tag_bits - b_num;
        auto two_pow_shift_lo_bits = static_cast<uint128_t>(1) << shift_lo_bits;
        auto a_lo = overflow ? b_num - tag_bits : a_num % two_pow_shift_lo_bits;
        auto a_hi = a_num >> shift_lo_bits;

        auto trace = TestTraceContainer({
            {
                { C::alu_a_hi, a_hi },
                { C::alu_a_hi_bits, shift_hi_bits },
                { C::alu_a_lo, a_lo },
                { C::alu_a_lo_bits, shift_lo_bits },
                { C::alu_ia, a },
                { C::alu_ia_tag, tag },
                { C::alu_ib, b },
                { C::alu_ib_tag, tag },
                { C::alu_ic, c },
                { C::alu_ic_tag, tag },
                { C::alu_max_bits, tag_bits },
                { C::alu_max_value, get_tag_max_value(mem_tag) },
                { C::alu_op_id, AVM_EXEC_OP_ID_ALU_SHR },
                { C::alu_sel, 1 },
                { C::alu_sel_decompose_a, 1 },
                { C::alu_sel_op_shr, 1 },
                { C::alu_sel_shift_ops, 1 },
                { C::alu_sel_shift_ops_no_overflow, overflow ? 0 : 1 },
                { C::alu_shift_lo_bits, shift_lo_bits },
                { C::alu_tag_ff_diff_inv, FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert() },
                { C::alu_two_pow_shift_lo_bits, two_pow_shift_lo_bits },
                { C::execution_mem_tag_reg_0_, tag },                           // = ia_tag
                { C::execution_mem_tag_reg_1_, tag },                           // = ib_tag
                { C::execution_mem_tag_reg_2_, tag },                           // = ic_tag
                { C::execution_register_0_, a },                                // = ia
                { C::execution_register_1_, b },                                // = ib
                { C::execution_register_2_, c },                                // = ic
                { C::execution_sel_execute_alu, 1 },                            // = sel
                { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_SHR }, // = alu_op_id

            },
        });

        precomputed_builder.process_misc(trace, std::max(NUM_OF_TAGS, static_cast<uint8_t>(shift_lo_bits + 1)));
        precomputed_builder.process_tag_parameters(trace);
        precomputed_builder.process_power_of_2(trace);
        range_check_builder.process({ { .value = a_lo, .num_bits = static_cast<uint8_t>(shift_lo_bits) },
                                      { .value = a_hi, .num_bits = static_cast<uint8_t>(shift_hi_bits) } },
                                    trace);

        return trace;
    }

    TestTraceContainer process_shr_with_tracegen(ThreeOperandTestParams params)
    {
        TestTraceContainer trace;
        auto [a, b, c] = params;
        auto b_num = static_cast<uint128_t>(b.as_ff());
        auto tag_bits = get_tag_bits(a.get_tag());
        auto overflow = b_num > tag_bits;
        uint128_t shift_lo_bits = overflow ? tag_bits : b_num;
        auto a_lo = overflow ? b_num - tag_bits
                             : static_cast<uint128_t>(a.as_ff()) % (static_cast<uint128_t>(1) << shift_lo_bits);

        builder.process(
            {
                { .operation = simulation::AluOperation::SHR, .a = a, .b = b, .c = c },
            },
            trace);

        precomputed_builder.process_misc(trace, std::max(NUM_OF_TAGS, static_cast<uint8_t>(shift_lo_bits + 1)));
        precomputed_builder.process_tag_parameters(trace);
        precomputed_builder.process_power_of_2(trace);
        range_check_builder.process({ { .value = a_lo, .num_bits = static_cast<uint8_t>(shift_lo_bits) },
                                      { .value = static_cast<uint128_t>(a.as_ff()) >> shift_lo_bits,
                                        .num_bits = static_cast<uint8_t>(overflow ? tag_bits : tag_bits - b_num) } },
                                    trace);
        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluShrConstrainingTest, ::testing::ValuesIn(TEST_VALUES_SHR));

TEST_P(AluShrConstrainingTest, AluShr)
{
    auto trace = process_shr_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluShrConstrainingTest, AluShrTraceGen)
{
    auto trace = process_shr_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    check_relation<alu>(trace);
}

TEST_F(AluShrConstrainingTest, NegativeAluShrFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 2);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 5);
    auto c = MemoryValue::from_tag(MemoryTag::FF, 2 << 5);
    auto trace = process_shr_with_tracegen({ a, b, c });
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    // This case should be recoverable, so we set the tag err selectors:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
    // Check the edge case of FF tag (=> max_bits = 0) and b = 0:
    trace.set(Column::alu_ib, 0, 0);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

TEST_F(AluShrConstrainingTest, NegativeAluShrTagMismatchOverflow)
{
    auto a = MemoryValue::from_tag(MemoryTag::U16, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 123456);
    auto c = MemoryValue::from_tag(MemoryTag::U16, 0);
    auto trace = process_shr_with_tracegen({ a, b, c });
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    trace.set(Column::alu_sel_ab_tag_mismatch, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv,
              0,
              (FF(static_cast<uint8_t>(MemoryTag::U16)) - FF(static_cast<uint8_t>(MemoryTag::U64))).invert());
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_ERR_CHECK");
    // This case should be recoverable, so we set the tag err selectors:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_sel_err, 0, 1);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_register_tag_value_settings>(trace);
}

// TRUNCATE operation (SET/CAST opcodes)

// Truncation is a special case as we always have FF TaggedValue inputs:
const std::vector<ThreeOperandTestParams> TEST_VALUES_TRUNCATE = {
    // Trivial truncation cases
    { MemoryValue::from_tag(MemoryTag::FF, 1),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U1)),
      MemoryValue::from_tag(MemoryTag::U1, 1) },
    { MemoryValue::from_tag(MemoryTag::FF, 42),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U8)),
      MemoryValue::from_tag(MemoryTag::U8, 42) },
    { MemoryValue::from_tag(MemoryTag::FF, 12345),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U16)),
      MemoryValue::from_tag(MemoryTag::U16, 12345) },
    { MemoryValue::from_tag(MemoryTag::FF, 123456789),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
      MemoryValue::from_tag(MemoryTag::U32, 123456789) },
    { MemoryValue::from_tag(MemoryTag::FF, 1234567890123456789ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U64)),
      MemoryValue::from_tag(MemoryTag::U64, 1234567890123456789ULL) },
    { MemoryValue::from_tag(MemoryTag::FF, (uint256_t(1) << 127) + 23423429816234ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U128)),
      MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 127) + 23423429816234ULL) },
    { MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 3),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::FF)),
      MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 3) },
    // Truncation cases (< 128 bits)
    { MemoryValue::from_tag(MemoryTag::FF, 212),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U1)),
      MemoryValue::from_tag(MemoryTag::U1, 0) },
    { MemoryValue::from_tag(MemoryTag::FF, 257),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U8)),
      MemoryValue::from_tag(MemoryTag::U8, 1) },
    { MemoryValue::from_tag(MemoryTag::FF, 65540),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U16)),
      MemoryValue::from_tag(MemoryTag::U16, 4) },
    { MemoryValue::from_tag(MemoryTag::FF, 4294967298ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
      MemoryValue::from_tag(MemoryTag::U32, 2) },
    { MemoryValue::from_tag(MemoryTag::FF, 18446744073709551615ULL + 4),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U64)),
      MemoryValue::from_tag(MemoryTag::U64, 3) },
    // Truncation cases (>= 128 bits)
    { MemoryValue::from_tag(MemoryTag::FF, (uint256_t(134534) << 129) + 986132),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U1)),
      MemoryValue::from_tag(MemoryTag::U1, 0) },
    { MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 128735618772ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U8)),
      MemoryValue::from_tag(MemoryTag::U8, 45) },
    { MemoryValue::from_tag(MemoryTag::FF, (uint256_t(999) << 128) - 986132ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U16)),
      MemoryValue::from_tag(MemoryTag::U16, 62444) },
    { MemoryValue::from_tag(MemoryTag::FF, (uint256_t(134534) << 198) + 986132ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
      MemoryValue::from_tag(MemoryTag::U32, 986132ULL) },
    { MemoryValue::from_tag(MemoryTag::FF, (uint256_t(134534) << 198) - 986132ULL),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U64)),
      MemoryValue::from_tag(MemoryTag::U64, static_cast<uint64_t>(-986132ULL)) },
    { MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 8723),
      MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U128)),
      MemoryValue::from_tag(MemoryTag::U128, static_cast<uint128_t>(FF::modulus - 8723)) },
};

class AluTruncateConstrainingTest : public AluConstrainingTest,
                                    public ::testing::WithParamInterface<ThreeOperandTestParams> {
  public:
    TestTraceContainer process_truncate_with_tracegen(const ThreeOperandTestParams& params, TestTraceContainer& trace)
    {
        auto [a, b, c] = params;

        builder.process(
            {
                { .operation = simulation::AluOperation::TRUNCATE, .a = a, .b = b, .c = c },
            },
            trace);

        precomputed_builder.process_misc(trace, NUM_OF_TAGS);
        precomputed_builder.process_tag_parameters(trace);

        auto is_non_trivial = trace.get(Column::alu_sel_trunc_non_trivial, 0) == 1;

        if (is_non_trivial) {
            auto a_decomp = simulation::decompose(static_cast<uint256_t>(a.as_ff()));
            auto dst_tag = c.get_tag();
            uint8_t bits = get_tag_bits(dst_tag);
            range_check_builder.process({ { .value = dst_tag == MemoryTag::U128 ? 0 : a_decomp.lo >> bits,
                                            .num_bits = static_cast<uint8_t>(128 - bits) } },
                                        trace);
            auto is_gte_128 = trace.get(Column::alu_sel_trunc_gte_128, 0) == 1;
            if (is_gte_128) {
                auto p_limbs = simulation::decompose(FF::modulus);
                simulation::LimbsComparisonWitness p_sub_a_witness = { .lo = p_limbs.lo - a_decomp.lo,
                                                                       .hi = p_limbs.hi - a_decomp.hi,
                                                                       .borrow = false };
                field_gt_builder.process({ { .operation = simulation::FieldGreaterOperation::CANONICAL_DECOMPOSITION,
                                             .a = a,
                                             .a_limbs = a_decomp,
                                             .p_sub_a_witness = p_sub_a_witness } },
                                         trace);
            }
        }

        return trace;
    }

    TestTraceContainer process_set_with_tracegen(const ThreeOperandTestParams& params)
    {
        TestTraceContainer trace;
        auto [a, b, _c] = params;
        auto dst_tag = static_cast<MemoryTag>(static_cast<uint8_t>(b.as_ff()));
        auto c = MemoryValue::from_tag_truncating(dst_tag, a);
        trace.set(0,
                  { {
                      { Column::execution_sel_execute_set, 1 },
                      { Column::execution_rop_2_, a },
                      { Column::execution_rop_1_, static_cast<uint8_t>(dst_tag) },
                      { Column::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_TRUNCATE },
                      { Column::execution_register_0_, c.as_ff() },
                      { Column::execution_mem_tag_reg_0_, static_cast<uint8_t>(dst_tag) },
                  } });

        process_truncate_with_tracegen(params, trace);

        return trace;
    }

    TestTraceContainer process_cast_with_tracegen(const ThreeOperandTestParams& params)
    {
        TestTraceContainer trace;
        auto [a, b, _c] = params;
        auto dst_tag = static_cast<MemoryTag>(static_cast<uint8_t>(b.as_ff()));
        auto c = MemoryValue::from_tag_truncating(dst_tag, a);
        trace.set(0,
                  { {
                      { Column::execution_sel_execute_cast, 1 },
                      { Column::execution_register_0_, a },
                      { Column::execution_rop_2_, static_cast<uint8_t>(dst_tag) },
                      { Column::execution_subtrace_operation_id, AVM_EXEC_OP_ID_ALU_TRUNCATE },
                      { Column::execution_register_1_, c.as_ff() },
                      { Column::execution_mem_tag_reg_1_, static_cast<uint8_t>(dst_tag) },
                  } });

        process_truncate_with_tracegen(params, trace);

        return trace;
    }
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, AluTruncateConstrainingTest, ::testing::ValuesIn(TEST_VALUES_TRUNCATE));

TEST_P(AluTruncateConstrainingTest, AluSet)
{
    auto trace = process_set_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_exec_dispatching_set_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTruncateConstrainingTest, AluCast)
{
    auto trace = process_cast_with_tracegen(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_exec_dispatching_set_settings>(trace);
    check_relation<alu>(trace);
}

TEST_P(AluTruncateConstrainingTest, NegativeTruncateWrongTrivialCase)
{
    TestTraceContainer trace;
    process_truncate_with_tracegen(GetParam(), trace);
    check_relation<alu>(trace);
    bool is_trivial = trace.get(Column::alu_sel_trunc_trivial, 0) == 1;
    trace.set(Column::alu_sel_trunc_trivial, 0, static_cast<uint8_t>(!is_trivial));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "SEL_TRUNC");
    trace.set(Column::alu_sel_trunc_trivial, 0, static_cast<uint8_t>(is_trivial));
    trace.set(Column::alu_sel_trunc_non_trivial, 0, static_cast<uint8_t>(is_trivial));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "SEL_TRUNC");
}

TEST_P(AluTruncateConstrainingTest, NegativeTruncateWrong128BitsCase)
{
    TestTraceContainer trace;
    process_truncate_with_tracegen(GetParam(), trace);
    check_relation<alu>(trace);
    bool is_lt_128 = trace.get(Column::alu_sel_trunc_lt_128, 0) == 1;
    trace.set(Column::alu_sel_trunc_lt_128, 0, static_cast<uint8_t>(!is_lt_128));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "SEL_TRUNC");
    trace.set(Column::alu_sel_trunc_lt_128, 0, static_cast<uint8_t>(is_lt_128));
    check_relation<alu>(trace);
    bool is_gte_128 = trace.get(Column::alu_sel_trunc_gte_128, 0) == 1;
    trace.set(Column::alu_sel_trunc_gte_128, 0, static_cast<uint8_t>(!is_gte_128));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "SEL_TRUNC");
}

TEST_F(AluTruncateConstrainingTest, NegativeTruncateWrongMid)
{
    TestTraceContainer trace;
    process_truncate_with_tracegen({ MemoryValue::from_tag(MemoryTag::FF, 4294967298ULL),
                                     MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
                                     MemoryValue::from_tag(MemoryTag::U32, 2) },
                                   trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_mid, 0, 1234ULL);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TRUNC_LO_128_DECOMPOSITION");
}

TEST_F(AluTruncateConstrainingTest, NegativeTruncateWrongMidBits)
{
    TestTraceContainer trace;
    process_truncate_with_tracegen({ MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 2),
                                     MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U1)),
                                     MemoryValue::from_tag(MemoryTag::U1, 1) },
                                   trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_mid_bits, 0, 32);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TRUNC_MID_BITS");
}

TEST_F(AluTruncateConstrainingTest, NegativeTruncateWrongLo128FromCanonDec)
{
    TestTraceContainer trace;
    process_truncate_with_tracegen({ MemoryValue::from_tag(MemoryTag::FF, (uint256_t(134534) << 198) - 986132ULL),
                                     MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U64)),
                                     MemoryValue::from_tag(MemoryTag::U64, static_cast<uint64_t>(-986132ULL)) },
                                   trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    trace.set(Column::alu_a_lo, 0, 1234ULL);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<AluTraceBuilder, lookup_alu_large_trunc_canonical_dec_settings>(trace)),
        "Failed.*LARGE_TRUNC_CANONICAL_DEC. Could not find tuple in destination.");
}

TEST_F(AluTruncateConstrainingTest, NegativeTruncateWrongMidIntoRangeCheck)
{
    TestTraceContainer trace;
    process_truncate_with_tracegen({ MemoryValue::from_tag(MemoryTag::FF, (uint256_t(134534) << 198) - 986132ULL),
                                     MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U64)),
                                     MemoryValue::from_tag(MemoryTag::U64, static_cast<uint64_t>(-986132ULL)) },
                                   trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    trace.set(Column::alu_mid, 0, 1234ULL);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_range_check_trunc_mid_settings>(trace)),
                              "Failed.*RANGE_CHECK_TRUNC_MID. Could not find tuple in destination.");
}

TEST_F(AluTruncateConstrainingTest, NegativeCastWrongDispatching)
{
    auto trace =
        process_cast_with_tracegen({ MemoryValue::from_tag(MemoryTag::FF, 4294967298ULL),
                                     MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
                                     MemoryValue::from_tag(MemoryTag::U32, 2) });
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_exec_dispatching_cast_settings>(trace);
    trace.set(Column::execution_register_0_, 0, trace.get(Column::execution_register_0_, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<ExecutionTraceBuilder, lookup_alu_exec_dispatching_cast_settings>(trace)),
        "Failed.*EXEC_DISPATCHING_CAST. Could not find tuple in destination.");
}

TEST_F(AluTruncateConstrainingTest, NegativeSetWrongDispatching)
{
    auto trace = process_set_with_tracegen({ MemoryValue::from_tag(MemoryTag::FF, 4294967298ULL),
                                             MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
                                             MemoryValue::from_tag(MemoryTag::U32, 2) });
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_alu_exec_dispatching_set_settings>(trace);
    trace.set(Column::execution_rop_2_, 0, trace.get(Column::execution_rop_2_, 0) + 1);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<ExecutionTraceBuilder, lookup_alu_exec_dispatching_set_settings>(trace)),
        "Failed.*EXEC_DISPATCHING_SET. Could not find tuple in destination.");
}

} // namespace
} // namespace bb::avm2::constraining
