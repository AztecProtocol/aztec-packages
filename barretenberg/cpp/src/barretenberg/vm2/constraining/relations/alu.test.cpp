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
using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;

constexpr uint8_t NUM_OF_TAGS = static_cast<uint8_t>(MemoryTag::MAX) + 1;

// The below test values do not carry:
const std::unordered_map<MemoryTag, std::array<FF, 6>> TEST_VALUES = {
    { MemoryTag::FF,
      { FF::modulus - 4,
        2,
        FF::modulus - 2,
        static_cast<uint8_t>(MemoryTag::FF),
        get_tag_bits(MemoryTag::FF),
        get_tag_max_value(MemoryTag::FF) } },
    { MemoryTag::U1,
      { 1, 0, 1, static_cast<uint8_t>(MemoryTag::U1), get_tag_bits(MemoryTag::U1), get_tag_max_value(MemoryTag::U1) } },
    { MemoryTag::U8,
      { 200,
        50,
        250,
        static_cast<uint8_t>(MemoryTag::U8),
        get_tag_bits(MemoryTag::U8),
        get_tag_max_value(MemoryTag::U8) } },
    { MemoryTag::U16,
      { 30,
        65500,
        65530,
        static_cast<uint8_t>(MemoryTag::U16),
        get_tag_bits(MemoryTag::U16),
        get_tag_max_value(MemoryTag::U16) } },
    { MemoryTag::U32,
      { (uint256_t(1) << 32) - 10,
        5,
        (uint256_t(1) << 32) - 5,
        static_cast<uint8_t>(MemoryTag::U32),
        get_tag_bits(MemoryTag::U32),
        get_tag_max_value(MemoryTag::U32) } },
    { MemoryTag::U64,
      { (uint256_t(1) << 64) - 10,
        5,
        (uint256_t(1) << 64) - 5,
        static_cast<uint8_t>(MemoryTag::U64),
        get_tag_bits(MemoryTag::U64),
        get_tag_max_value(MemoryTag::U64) } },
    { MemoryTag::U128,
      { (uint256_t(1) << 128) - 10,
        5,
        (uint256_t(1) << 128) - 5,
        static_cast<uint8_t>(MemoryTag::U128),
        get_tag_bits(MemoryTag::U128),
        get_tag_max_value(MemoryTag::U128) } },
};

auto process_basic_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto [a, b, c, tag, max_bits, max_value] = TEST_VALUES.at(input_tag);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = tag,
            .alu_max_bits = max_bits,
            .alu_max_value = max_value,
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,                           // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                           // = ib_tag
            .execution_mem_tag_reg_2_ = tag,                           // = ic_tag
            .execution_register_0_ = a,                                // = ia
            .execution_register_1_ = b,                                // = ib
            .execution_register_2_ = c,                                // = ic
            .execution_sel_alu = 1,                                    // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_ADD, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

auto process_carry_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto [_a, _b, _c, tag, max_bits, max_value] = TEST_VALUES.at(input_tag);
    // Special cases for U1 since the only 'carry' case is 1 + 1 = 0:
    auto a = input_tag == MemoryTag::U1 ? 1 : max_value - 1;
    auto b = input_tag == MemoryTag::U1 ? 1 : 3;
    auto c = input_tag == MemoryTag::U1 ? 0 : 1;
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = tag,
            .alu_max_bits = max_bits,
            .alu_max_value = max_value,
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,                           // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                           // = ib_tag
            .execution_mem_tag_reg_2_ = tag,                           // = ic_tag
            .execution_register_0_ = a,                                // = ia
            .execution_register_1_ = b,                                // = ib
            .execution_register_2_ = c,                                // = ic
            .execution_sel_alu = 1,                                    // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_ADD, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TestTraceContainer process_lt_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    auto [a, b, _c, tag, max_bits, max_value] = TEST_VALUES.at(input_tag);
    auto is_ff = input_tag == MemoryTag::FF;
    auto c = static_cast<uint8_t>(static_cast<uint256_t>(a) < static_cast<uint256_t>(b));

    // When we have input fields, we use field_gt for lt and do not use lt_abs_diff
    // In the circuit, we force lt_abs_diff to be 0 so the range_check does not fail
    auto result = c == 1 ? b - a - 1 : a - b;
    auto lt_abs_diff = is_ff ? 0 : result;
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = static_cast<uint8_t>(MemoryTag::U1),
            .alu_lt_abs_diff = lt_abs_diff,
            .alu_max_bits = max_bits,
            .alu_max_value = max_value,
            .alu_op_id = AVM_EXEC_OP_ID_ALU_LT,
            .alu_sel = 1,
            .alu_sel_ff_lt = static_cast<uint8_t>(is_ff),
            .alu_sel_is_ff = static_cast<uint8_t>(is_ff),
            .alu_sel_op_lt = 1,
            .alu_tag_ff_diff_inv = is_ff ? 0 : FF(tag - static_cast<uint8_t>(MemoryTag::FF)).invert(),
            .execution_mem_tag_reg_0_ = tag,                                 // = ia_tag
            .execution_mem_tag_reg_1_ = tag,                                 // = ib_tag
            .execution_mem_tag_reg_2_ = static_cast<uint8_t>(MemoryTag::U1), // = ic_tag
            .execution_register_0_ = a,                                      // = ia
            .execution_register_1_ = b,                                      // = ib
            .execution_register_2_ = c,                                      // = ic
            .execution_sel_alu = 1,                                          // = sel
            .execution_subtrace_operation_id = AVM_EXEC_OP_ID_ALU_LT,        // = alu_op_id
        },
    });
    if (input_tag == MemoryTag::FF) {
        field_gt_builder.process({ { .a = b, .b = a, .result = a < b } }, trace);
    }
    range_check_builder.process(
        { { .value = static_cast<uint128_t>(lt_abs_diff), .num_bits = static_cast<uint8_t>(max_bits) } }, trace);
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

TEST(AluConstrainingTest, EmptyRow)
{
    check_relation<alu>(testing::empty_trace());
}

TEST(AluConstrainingTest, BasicAdd)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U8);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = tag,
            .alu_ib = 2,
            .alu_ib_tag = tag,
            .alu_ic = 3,
            .alu_ic_tag = tag,
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });

    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddFieldWithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::FF);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU1WithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::U1);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU8WithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::U8);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU16WithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::U16);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU32WithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::U32);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU64WithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::U64);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU128WithLookups)
{
    auto trace = process_basic_add_trace(MemoryTag::U128);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU1WithLookups)
{
    auto trace = process_carry_add_trace(MemoryTag::U1);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU8WithLookups)
{
    auto trace = process_carry_add_trace(MemoryTag::U8);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU16WithLookups)
{
    auto trace = process_carry_add_trace(MemoryTag::U16);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU32WithLookups)
{
    auto trace = process_carry_add_trace(MemoryTag::U32);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU64WithLookups)
{
    auto trace = process_carry_add_trace(MemoryTag::U64);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU128WithLookups)
{
    auto trace = process_carry_add_trace(MemoryTag::U128);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, NegativeAddWrongOpId)
{
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD + 1,
            .alu_sel_op_add = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_OP_ID_CHECK), "OP_ID_CHECK");
}

TEST(AluConstrainingTest, NegativeBasicAdd)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U8);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = tag,
            .alu_ib = 2,
            .alu_ib_tag = tag,
            .alu_ic = 3,
            .alu_ic_tag = tag,
            .alu_op_id = AVM_EXEC_OP_ID_ALU_ADD,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });

    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST(AluConstrainingTest, NegativeAddCarryU1)
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

TEST(AluConstrainingTest, NegativeAddCarryU8)
{
    auto trace = process_carry_add_trace(MemoryTag::U8);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    // TODO(MW): The below should fail the range check on c in memory, but we cannot test this yet.
    // Instead, we assume the carry flag is correct and show an overflow fails:
    trace.set(Column::alu_ic, 0, 257);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST(AluConstrainingTest, NegativeAddWrongTag)
{
    // If the values are actually U8s, but we set the tags as U16, then the max value will fail
    auto trace = process_basic_add_trace(MemoryTag::U16);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_max_value, 0, get_tag_max_value(MemoryTag::U8));
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_BITS_VALUE");
}

TEST(AluConstrainingTest, NegativeAddWrongTagABMismatch)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U16);
    auto trace = process_basic_add_trace(MemoryTag::U16);
    trace.set(Column::alu_ib_tag, 0, tag - 1);
    // ab_tags_diff_inv = inv(a_tag - b_tag) = inv(1) = 1:
    trace.set(Column::alu_ab_tags_diff_inv, 0, 1);
    trace.set(Column::alu_sel_tag_err, 0, 1);
    // Though the tags don't match, with error handling we can return the error rather than fail:
    check_relation<alu>(trace);
    // Removing the error will fail:
    trace.set(Column::alu_sel_tag_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

TEST(AluConstrainingTest, NegativeAddWrongTagCMismatch)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U16);
    auto trace = process_basic_add_trace(MemoryTag::U16);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, tag - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}

// LT TESTS

TEST(AluConstrainingTest, LTFieldWithLookups)
{
    auto trace = process_lt_trace(MemoryTag::FF);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU1WithLookups)
{
    auto trace = process_lt_trace(MemoryTag::U1);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU8WithLookups)
{
    auto trace = process_lt_trace(MemoryTag::U8);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU16WithLookups)
{
    auto trace = process_lt_trace(MemoryTag::U16);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU32WithLookups)
{
    auto trace = process_lt_trace(MemoryTag::U32);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU64WithLookups)
{
    auto trace = process_lt_trace(MemoryTag::U64);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU128WithLookups)
{
    auto trace = process_lt_trace(MemoryTag::U128);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, NegativeLTU8)
{
    RangeCheckTraceBuilder range_check_builder;
    auto trace = process_lt_trace(MemoryTag::U8);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    bool c = trace.get(Column::alu_ic, 0) == 1;
    trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
    // Which value to range check differs based on c (here, c = 1 => check b - a - 1, c = 0 => check a - b), so that is
    // the first relation failure...
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_LT_RESULT");
    auto new_result_to_range_check = -trace.get(Column::alu_lt_abs_diff, 0);
    new_result_to_range_check = c ? new_result_to_range_check + 1 : new_result_to_range_check - 1;
    trace.set(Column::alu_lt_abs_diff, 0, new_result_to_range_check);
    // ...now, we are range checking the correct value...
    check_relation<alu>(trace);
    // ..but the check itself correctly fails (note: new_result_to_range_check doesn't fit in a u128, I'm just adding an
    // event which will definitely fail):
    range_check_builder.process(
        { { .value = static_cast<uint128_t>(new_result_to_range_check), .num_bits = get_tag_bits(MemoryTag::U8) } },
        trace);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_lt_range_settings>(trace)),
                              "LOOKUP_ALU_LT_RANGE");
}

TEST(AluConstrainingTest, NegativeLTU64)
{
    RangeCheckTraceBuilder range_check_builder;
    auto trace = process_lt_trace(MemoryTag::U64);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    bool c = trace.get(Column::alu_ic, 0) == 1;
    auto a = trace.get(Column::alu_ia, 0);
    auto wrong_b = c ? a - 1 : a + 1;
    trace.set(Column::alu_ib, 0, wrong_b);
    // The absolute diff is now wrong:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_LT_RESULT");
    // Correct the diff based on incorrect c:
    auto new_abs_diff = c ? wrong_b - a - 1 : a - wrong_b;
    trace.set(Column::alu_lt_abs_diff, 0, new_abs_diff);
    // Now, we are range checking the correct value...
    check_relation<alu>(trace);
    // ..but the check itself correctly fails (note: new_result_to_range_check doesn't fit in a u128, I'm just adding an
    // event which will definitely fail):
    range_check_builder.process(
        { { .value = static_cast<uint128_t>(new_abs_diff), .num_bits = get_tag_bits(MemoryTag::U64) } }, trace);
    EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_lt_range_settings>(trace)),
                              "LOOKUP_ALU_LT_RANGE");
}

TEST(AluConstrainingTest, NegativeLTFF)
{
    auto trace = process_lt_trace(MemoryTag::FF);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    bool c = trace.get(Column::alu_ic, 0) == 1;
    trace.set(Column::alu_ic, 0, static_cast<uint8_t>(!c));
    // We rely on lookups, so we expect the relations to still pass...
    check_relation<alu>(trace);
    // ... but the lookup will fail (TODO(MW): properly add a gt and => range check events so it fails because c is
    // wrong, rather than because this test has not processed the events):
    EXPECT_THROW_WITH_MESSAGE((check_interaction<AluTraceBuilder, lookup_alu_ff_lt_settings>(trace)),
                              "LOOKUP_ALU_FF_LT");
}

// TODO(MW): Below tests needed? Same as add case:
// ----------------

TEST(AluConstrainingTest, NegativeLTWrongTag)
{
    // If the values are actually U8s, but we set the tags as U16, then the max value will fail
    auto trace = process_lt_trace(MemoryTag::U16);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    trace.set(Column::alu_max_value, 0, get_tag_max_value(MemoryTag::U8));
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_BITS_VALUE");
}

TEST(AluConstrainingTest, NegativeLTWrongTagABMismatch)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U16);
    auto trace = process_lt_trace(MemoryTag::U16);
    trace.set(Column::alu_ib_tag, 0, tag - 1);
    // ab_tags_diff_inv = inv(a_tag - b_tag) = inv(1) = 1:
    trace.set(Column::alu_ab_tags_diff_inv, 0, 1);
    trace.set(Column::alu_sel_tag_err, 0, 1);
    // Though the tags don't match, with error handling we can return the error rather than fail:
    check_relation<alu>(trace);
    // Removing the error will fail:
    trace.set(Column::alu_sel_tag_err, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

TEST(AluConstrainingTest, NegativeLTWrongTagCMismatch)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U16);
    auto trace = process_lt_trace(MemoryTag::U16);
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, tag - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
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
    PrecomputedTraceBuilder precomputed_builder;

    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = simulation::AluOperation::EQ,
              .a = params.a,
              .b = params.b,
              .c = params.c,
              .error = error ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

// Parametrized test for EQ operations with same values and tags
class EQSameValuesAndTagsTest : public ::testing::TestWithParam<MemoryValue> {};

TEST_P(EQSameValuesAndTagsTest, Basic)
{
    const MemoryValue& param = GetParam();
    auto trace = process_eq_trace(ThreeOperandTestParams{ .a = param, .b = param, .c = MemoryValue::from<uint1_t>(1) });
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

// Test parameters: MemoryValue a
INSTANTIATE_TEST_SUITE_P(AluConstrainingTest,
                         EQSameValuesAndTagsTest,
                         ::testing::Values(MemoryValue::from<uint1_t>(1),
                                           MemoryValue::from<uint8_t>(42),
                                           MemoryValue::from<uint16_t>(12345),
                                           MemoryValue::from<uint32_t>(123456789),
                                           MemoryValue::from<uint64_t>(1234567890123456789ULL),
                                           MemoryValue::from<uint128_t>((uint128_t(1) << 127) + 23423429816234ULL),
                                           MemoryValue::from<FF>(FF(uint256_t(1) << 255) + 123423429816234ULL)));

class EQInequalityTest : public ::testing::TestWithParam<ThreeOperandTestParams> {};

TEST_P(EQInequalityTest, Basic)
{
    auto trace = process_eq_trace(GetParam());
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

const std::vector<ThreeOperandTestParams> EQ_INEQUALITY_TEST_PARAMS = {
    { .a = MemoryValue::from<uint1_t>(1), .b = MemoryValue::from<uint1_t>(0), .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint8_t>(42), .b = MemoryValue::from<uint8_t>(24), .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint16_t>(12345),
      .b = MemoryValue::from<uint16_t>(54321),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint32_t>(123456789),
      .b = MemoryValue::from<uint32_t>(987654321),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
      .b = MemoryValue::from<uint64_t>(9876543210987654321ULL),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint128_t>((uint128_t(1) << 127) + 23423429816234ULL),
      .b = MemoryValue::from<uint128_t>((uint128_t(1) << 127) + 9876543210987654321ULL),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<FF>(FF::modulus - 3),
      .b = MemoryValue::from<FF>(FF::modulus - 1),
      .c = MemoryValue::from<uint1_t>(0) }
};

// Test parameters for inequality: (MemoryValue a, MemoryValue b) - values are different
INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, EQInequalityTest, ::testing::ValuesIn(EQ_INEQUALITY_TEST_PARAMS));

// Parametrized test for EQ operations with different value tags (tag error case)
class EQTagErrorTest : public ::testing::TestWithParam<ThreeOperandTestParams> {};

TEST_P(EQTagErrorTest, Basic)
{
    auto trace = process_eq_trace(GetParam(), true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

const std::vector<ThreeOperandTestParams> EQ_TAG_ERROR_TEST_PARAMS = {
    // Equality case
    { .a = MemoryValue::from<uint8_t>(42), .b = MemoryValue::from<uint16_t>(42), .c = MemoryValue::from<uint1_t>(1) },
    { .a = MemoryValue::from<uint32_t>(123456789),
      .b = MemoryValue::from<uint64_t>(123456789),
      .c = MemoryValue::from<uint1_t>(1) },
    { .a = MemoryValue::from<uint128_t>(123456789),
      .b = MemoryValue::from<FF>(123456789),
      .c = MemoryValue::from<uint1_t>(1) },
    { .a = MemoryValue::from<FF>(42), .b = MemoryValue::from<uint8_t>(42), .c = MemoryValue::from<uint1_t>(1) },
    { .a = MemoryValue::from<uint1_t>(1), .b = MemoryValue::from<uint8_t>(1), .c = MemoryValue::from<uint1_t>(1) },
    { .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
      .b = MemoryValue::from<uint128_t>(1234567890123456789ULL),
      .c = MemoryValue::from<uint1_t>(1) },
    // Inequality case
    { .a = MemoryValue::from<uint8_t>(42),
      .b = MemoryValue::from<uint16_t>(12345),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint32_t>(123456789),
      .b = MemoryValue::from<uint64_t>(9876543210987654321ULL),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint128_t>(123456789),
      .b = MemoryValue::from<FF>(FF::modulus - 42),
      .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<FF>(42), .b = MemoryValue::from<uint8_t>(200), .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint1_t>(1), .b = MemoryValue::from<uint8_t>(255), .c = MemoryValue::from<uint1_t>(0) },
    { .a = MemoryValue::from<uint64_t>(1234567890123456789ULL),
      .b = MemoryValue::from<uint128_t>(9876543210987654321ULL),
      .c = MemoryValue::from<uint1_t>(0) }
};

// Test parameters for tag error: (MemoryValue a, MemoryValue b) - different tags
INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, EQTagErrorTest, ::testing::ValuesIn(EQ_TAG_ERROR_TEST_PARAMS));

// Negative tests for EQ operations
TEST(AluConstrainingTest, NegativeEQWrongOpId)
{
    auto test_a = MemoryValue::from<uint8_t>(42);
    auto test_b = MemoryValue::from<uint8_t>(42);
    auto trace =
        process_eq_trace(ThreeOperandTestParams{ .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(1) });
    check_relation<alu>(trace);
    trace.set(Column::alu_op_id, 0, AVM_EXEC_OP_ID_ALU_ADD);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "OP_ID_CHECK");
}

TEST(AluConstrainingTest, NegativeEQWrongResult)
{
    auto test_a = MemoryValue::from<uint8_t>(42);
    auto test_b = MemoryValue::from<uint8_t>(42);
    auto trace =
        process_eq_trace(ThreeOperandTestParams{ .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(1) });
    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, 0); // Wrong result
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "EQ_OP_MAIN");
}

TEST(AluConstrainingTest, NegativeEQWrongHelper1)
{
    auto test_a = MemoryValue::from<uint8_t>(42);
    auto test_b = MemoryValue::from<uint8_t>(24);
    auto trace =
        process_eq_trace(ThreeOperandTestParams{ .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(0) });
    check_relation<alu>(trace);
    trace.set(Column::alu_helper1, 0, 1111); // Wrong helper1 for inequality
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "EQ_OP_MAIN");
}

TEST(AluConstrainingTest, NegativeEQWrongTagCMismatch)
{
    auto test_a = MemoryValue::from<uint16_t>(12345);
    auto test_b = MemoryValue::from<uint16_t>(12345);
    auto trace =
        process_eq_trace(ThreeOperandTestParams{ .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(1) });
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, static_cast<uint8_t>(bb::avm2::MemoryTag::U16) - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}

TEST(AluConstrainingTest, NegativeEQWrongTagABMismatch)
{
    auto test_a = MemoryValue::from<uint16_t>(12345);
    auto test_b = MemoryValue::from<uint64_t>(12345);
    auto trace =
        process_eq_trace(ThreeOperandTestParams{ .a = test_a, .b = test_b, .c = MemoryValue::from<uint1_t>(1) });
    trace.set(Column::alu_sel_tag_err, 0, 0); // Remove tag error flag
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
    // Correctly using the error, but injecting the wrong inverse will fail:
    trace.set(Column::alu_sel_tag_err, 0, 1);
    trace.set(Column::alu_ab_tags_diff_inv, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

// NOT Opcode TESTS
TestTraceContainer process_not_op_trace(const ThreeOperandTestParams& params, bool error = false)
{
    PrecomputedTraceBuilder precomputed_builder;

    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = simulation::AluOperation::NOT,
              .a = params.a,
              .b = params.b,
              .error = error ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    precomputed_builder.process_misc(trace, NUM_OF_TAGS);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

class NotIntegralTest : public ::testing::TestWithParam<ThreeOperandTestParams> {};

TEST_P(NotIntegralTest, Basic)
{
    const auto& params = GetParam();
    auto trace = process_not_op_trace(params);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);

    trace.set(Column::alu_ib, 0, trace.get(Column::alu_ib, 0) + 1); // Mutate output
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "NOT_OP_MAIN");
}

const MemoryValue NOT_INTEGRAL_TEST_A_U1 = MemoryValue::from<uint1_t>(1);
const MemoryValue NOT_INTEGRAL_TEST_A_U8 = MemoryValue::from<uint8_t>(42);
const MemoryValue NOT_INTEGRAL_TEST_A_U16 = MemoryValue::from<uint16_t>(12345);
const MemoryValue NOT_INTEGRAL_TEST_A_U32 = MemoryValue::from<uint32_t>(123456789);
const MemoryValue NOT_INTEGRAL_TEST_A_U64 = MemoryValue::from<uint64_t>(1234567890123456789ULL);
const MemoryValue NOT_INTEGRAL_TEST_A_U128 = MemoryValue::from<uint128_t>(987654);

const std::vector<ThreeOperandTestParams> NOT_INTEGRAL_TEST_PARAMS = {
    {
        .a = NOT_INTEGRAL_TEST_A_U1,
        .b = ~NOT_INTEGRAL_TEST_A_U1,
    },
    {
        .a = NOT_INTEGRAL_TEST_A_U8,
        .b = ~NOT_INTEGRAL_TEST_A_U8,
    },
    {
        .a = NOT_INTEGRAL_TEST_A_U16,
        .b = ~NOT_INTEGRAL_TEST_A_U16,
    },
    {
        .a = NOT_INTEGRAL_TEST_A_U32,
        .b = ~NOT_INTEGRAL_TEST_A_U32,
    },
    {
        .a = NOT_INTEGRAL_TEST_A_U64,
        .b = ~NOT_INTEGRAL_TEST_A_U64,
    },
    {
        .a = NOT_INTEGRAL_TEST_A_U128,
        .b = ~NOT_INTEGRAL_TEST_A_U128,
    },
};

INSTANTIATE_TEST_SUITE_P(AluConstrainingTest, NotIntegralTest, ::testing::ValuesIn(NOT_INTEGRAL_TEST_PARAMS));

TEST(AluConstrainingTest, NotFF)
{
    auto trace = process_not_op_trace(
        { .a = MemoryValue::from<FF>(FF::modulus - 3), .b = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0) },
        true);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, NegativeNotWrongOpId)
{
    const auto a = MemoryValue::from<uint8_t>(42);
    auto trace = process_not_op_trace({ .a = a, .b = ~a });
    check_relation<alu>(trace);
    trace.set(Column::alu_op_id, 0, AVM_EXEC_OP_ID_ALU_EQ);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "OP_ID_CHECK");
}

TEST(AluConstrainingTest, NegativeNotWrongTag)
{
    const auto a = MemoryValue::from<uint8_t>(42);
    auto trace = process_not_op_trace({ .a = a, .b = ~a });
    check_relation<alu>(trace);
    trace.set(Column::alu_ib_tag, 0, static_cast<uint8_t>(bb::avm2::MemoryTag::U16));
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "AB_TAGS_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
