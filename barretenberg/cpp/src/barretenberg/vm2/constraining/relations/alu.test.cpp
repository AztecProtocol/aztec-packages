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

// The below test values do not carry:
const std::unordered_map<MemoryTag, std::array<FF, 5>> TEST_VALUES = {
    { MemoryTag::FF,
      { FF::modulus - 4, 2, FF::modulus - 2, static_cast<uint8_t>(MemoryTag::FF), get_tag_max_value(MemoryTag::FF) } },
    { MemoryTag::U1, { 1, 0, 1, static_cast<uint8_t>(MemoryTag::U1), get_tag_max_value(MemoryTag::U1) } },
    { MemoryTag::U8, { 200, 50, 250, static_cast<uint8_t>(MemoryTag::U8), get_tag_max_value(MemoryTag::U8) } },
    { MemoryTag::U16, { 30, 65500, 65530, static_cast<uint8_t>(MemoryTag::U16), get_tag_max_value(MemoryTag::U16) } },
    { MemoryTag::U32,
      { (uint256_t(1) << 32) - 10,
        5,
        (uint256_t(1) << 32) - 5,
        static_cast<uint8_t>(MemoryTag::U32),
        get_tag_max_value(MemoryTag::U32) } },
    { MemoryTag::U64,
      { (uint256_t(1) << 64) - 10,
        5,
        (uint256_t(1) << 64) - 5,
        static_cast<uint8_t>(MemoryTag::U64),
        get_tag_max_value(MemoryTag::U64) } },
    { MemoryTag::U128,
      { (uint256_t(1) << 128) - 10,
        5,
        (uint256_t(1) << 128) - 5,
        static_cast<uint8_t>(MemoryTag::U128),
        get_tag_max_value(MemoryTag::U128) } },
};

auto process_basic_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto [a, b, c, tag, max_value] = TEST_VALUES.at(input_tag);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = a,
            .alu_ia_tag = tag,
            .alu_ib = b,
            .alu_ib_tag = tag,
            .alu_ic = c,
            .alu_ic_tag = tag,
            .alu_max_value = max_value,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,      // = ia_tag
            .execution_mem_tag_reg_1_ = tag,      // = ib_tag
            .execution_mem_tag_reg_2_ = tag,      // = ic_tag
            .execution_register_0_ = a,           // = ia
            .execution_register_1_ = b,           // = ib
            .execution_register_2_ = c,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, static_cast<uint8_t>(tag) + 1);
    precomputed_builder.process_tag_parameters(trace);
    return trace;
}

auto process_carry_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto [_a, _b, _c, tag, max_value] = TEST_VALUES.at(input_tag);
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
            .alu_max_value = max_value,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,      // = ia_tag
            .execution_mem_tag_reg_1_ = tag,      // = ib_tag
            .execution_mem_tag_reg_2_ = tag,      // = ic_tag
            .execution_register_0_ = a,           // = ia
            .execution_register_1_ = b,           // = ib
            .execution_register_2_ = c,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, static_cast<uint8_t>(tag) + 1);
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
            .alu_op_id = 1,
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
    // Note: test a bit misleading as we currently only have one operation
    // TODO(MW): Update this with new ops
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_op_id = 2, // See SUBTRACE_INFO_MAP for list of op_ids (ADD -> 1)
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
            .alu_op_id = 1,
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
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_VALUE.");
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

TEST(AluConstrainingTest, BasicLT)
{
    // Using u8s here => alu_ia/b_tag = ValueTag::U8 = 2
    // LT operation id -> SUBTRACE_INFO_MAP.at(LT) = 1 << 6
    // Note: chosen a = 1 and b = 2, so the range check for ALU_LT_RESULT will be on b - a - 1 = 0 and there's no need
    // to set it here:
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 1,
            .alu_ic_tag = 1,
            .alu_op_id = 1 << 6,
            .alu_sel = 1,
            .alu_sel_op_lt = 1,
            .alu_tag_ff_diff_inv = FF(2).invert(),
        },
    });

    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTFieldWithLookups)
{
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    // Using F here => alu_ix_tag = ValueTag::FF = 0, max_bits = 254, max_value = p - 1
    // LT operation id -> SUBTRACE_INFO_MAP.at(LT) = 1 << 6
    // Note: chosen a = 1 and b = 2, so the range check for ALU_LT_RESULT will be on b - a - 1 = 0 and there's no need
    // to set it here:
    auto trace = TestTraceContainer::from_rows({
        // Note: a, b tags are all 0, so not filling them here:
        {
            .alu_ia = 1,
            .alu_ib = 2,
            .alu_ic = 1,
            .alu_ic_tag = 1,
            .alu_max_bits = 254,
            .alu_max_value = FF(-1),
            .alu_op_id = 1 << 6,
            .alu_sel = 1,
            .alu_sel_ff_lt = 1,
            .alu_sel_is_ff = 1,
            .alu_sel_op_lt = 1,
            .execution_mem_tag_2_ = 1,                 // = ic_tag
            .execution_register_0_ = 1,                // = ia
            .execution_register_1_ = 2,                // = ib
            .execution_register_2_ = 1,                // = ic
            .execution_sel_alu = 1,                    // = sel
            .execution_subtrace_operation_id = 1 << 6, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 1);
    precomputed_builder.process_tag_parameters(trace);
    // TODO(MW): Does the below work with 254?
    range_check_builder.process({ { .value = 0, .num_bits = 254 } }, trace);
    field_gt_builder.process({ { .a = 2, .b = 1, .result = true } }, trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, LTU128WithLookups)
{
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    // Using u128 here => alu_ix_tag = ValueTag::U128 = 6, max_bits = 128, max_value = 2^128 - 1
    // LT operation id -> SUBTRACE_INFO_MAP.at(LT) = 1 << 6
    // Note: chosen a = 1 and b = 2, so the range check for ALU_LT_RESULT will be on b - a - 1 = 0 and there's no need
    // to set it here:
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 6,
            .alu_ib = 2,
            .alu_ib_tag = 6,
            .alu_ic = 1,
            .alu_ic_tag = 1,
            .alu_max_bits = 128,
            .alu_max_value = (uint256_t(1) << 128) - 1,
            .alu_op_id = 1 << 6,
            .alu_sel = 1,
            .alu_sel_op_lt = 1,
            .alu_tag_ff_diff_inv = FF(6).invert(),
            .execution_mem_tag_0_ = 6,                 // = ia_tag
            .execution_mem_tag_1_ = 6,                 // = ib_tag
            .execution_mem_tag_2_ = 1,                 // = ic_tag
            .execution_register_0_ = 1,                // = ia
            .execution_register_1_ = 2,                // = ib
            .execution_register_2_ = 1,                // = ic
            .execution_sel_alu = 1,                    // = sel
            .execution_subtrace_operation_id = 1 << 6, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 7);
    precomputed_builder.process_tag_parameters(trace);
    // TODO(MW): Does the below work with 128?
    range_check_builder.process({ { .value = 0, .num_bits = 128 } }, trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, NegativeBasicLT)
{
    RangeCheckTraceBuilder range_check_builder;
    // Using u8s here => alu_ia/b_tag = ValueTag::U8 = 2
    // LT operation id -> SUBTRACE_INFO_MAP.at(LT) = 1 << 6
    // Note: chosen a = 1 and b = 2, so the range check for ALU_LT_RESULT will be on b - a - 1 = 0 and there's no need
    // to set it here:
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 1,
            .alu_ic_tag = 1,
            .alu_op_id = 1 << 6,
            .alu_sel = 1,
            .alu_sel_op_lt = 1,
            .alu_tag_ff_diff_inv = FF(2).invert(),
        },
    });
    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, 0);
    // Which value to range check differs based on c (here, c = 1 => check 0, c = 0 => check a - b = -1), so that is the
    // first relation failure...
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_LT_RESULT");
    trace.set(Column::alu_lt_result_to_range_check, 0, FF(-1));
    // ...now, we are range checking the correct value...
    check_relation<alu>(trace);
    // ..but the check itself correctly fails (note: FF(-1) doesn't fit in a u128, I'm just adding an event which will
    // definitely fail):
    range_check_builder.process({ { .value = static_cast<uint128_t>(FF(-1)), .num_bits = 8 } }, trace);
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_LT_RANGE.");
}

TEST(AluConstrainingTest, NegativeLTWrongTag)
{
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_bits = 16, max_value = 2^16 - 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 2,
            .alu_ia_tag = 2, // Should be 3
            .alu_ib = 1,
            .alu_ib_tag = 2,
            .alu_ic = 1,
            .alu_ic_tag = 1,
            .alu_max_bits = 16,
            .alu_max_value = (1 << 16) - 1,
            .alu_op_id = 1 << 6,
            .alu_sel = 1,
            .alu_sel_op_lt = 1,
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 4);
    precomputed_builder.process_tag_parameters(trace);
    range_check_builder.process({ { .value = 0, .num_bits = 16 } }, trace);
    // The register will pass (sel_alu = 0, not tested here), with the incorrect tag being caught by the lookup:
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_BITS_VALUE.");
}
} // namespace
} // namespace bb::avm2::constraining
