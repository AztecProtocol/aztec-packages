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
using tracegen::PrecomputedTraceBuilder;

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

// Note: CANNOT be used for u1
auto process_carry_add_trace(MemoryTag input_tag)
{
    PrecomputedTraceBuilder precomputed_builder;
    auto [_a, _b, _c, tag, max_value] = TEST_VALUES.at(input_tag);
    auto a = max_value - 1;
    auto b = 3;
    auto c = 1;
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
    PrecomputedTraceBuilder precomputed_builder;
    auto tag = static_cast<uint8_t>(MemoryTag::U1);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1,
            .alu_ia_tag = tag,
            .alu_ib = 1,
            .alu_ib_tag = tag,
            .alu_ic = 0,
            .alu_ic_tag = tag,
            .alu_max_value = get_tag_max_value(MemoryTag::U1),
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_reg_0_ = tag,      // = ia_tag
            .execution_mem_tag_reg_1_ = tag,      // = ib_tag
            .execution_mem_tag_reg_2_ = tag,      // = ic_tag
            .execution_register_0_ = 1,           // = ia
            .execution_register_1_ = 1,           // = ib
            .execution_register_2_ = 0,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, static_cast<uint8_t>(tag) + 1);
    precomputed_builder.process_tag_parameters(trace);
    check_interaction<AluTraceBuilder, lookup_alu_tag_max_value_settings>(trace);
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
    PrecomputedTraceBuilder precomputed_builder;
    auto tag = static_cast<uint8_t>(MemoryTag::U1);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1,
            .alu_ia_tag = tag,
            .alu_ib = 1,
            .alu_ib_tag = tag,
            .alu_ic = 0,
            .alu_ic_tag = tag,
            .alu_max_value = get_tag_max_value(MemoryTag::U1),
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 2);
    precomputed_builder.process_tag_parameters(trace);
    // The register lookup will pass (sel_alu = 0, not tested here):
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
    PrecomputedTraceBuilder precomputed_builder;
    auto tag = static_cast<uint8_t>(MemoryTag::U8);
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 2,
            .alu_ia_tag = tag, // Should be U16 tag
            .alu_ib = 1,
            .alu_ib_tag = tag,
            .alu_ic = 3,
            .alu_ic_tag = tag,
            .alu_max_value = get_tag_max_value(MemoryTag::U16),
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 4);
    precomputed_builder.process_tag_parameters(trace);
    // The register will pass (sel_alu = 0, not tested here), with the incorrect tag being caught by the lookup:
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<AluTraceBuilder>(trace), "LOOKUP_ALU_TAG_MAX_VALUE.");
}

TEST(AluConstrainingTest, NegativeAddWrongTagABMismatch)
{
    auto tag = static_cast<uint8_t>(MemoryTag::U16);
    auto trace = TestTraceContainer::from_rows({
        {
            // ab_tags_diff_inv = inv(a_tag - b_tag) = inv(1) = 1:
            .alu_ab_tags_diff_inv = 1,
            .alu_ia = 2,
            .alu_ia_tag = tag,
            .alu_ib = 1,
            .alu_ib_tag = tag - 1, // Incorrect
            .alu_ic = 3,
            .alu_ic_tag = tag,
            .alu_max_value = get_tag_max_value(MemoryTag::U16),
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_sel_tag_err = 1,
        },
    });

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
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 2,
            .alu_ia_tag = tag,
            .alu_ib = 1,
            .alu_ib_tag = tag,
            .alu_ic = 3,
            .alu_ic_tag = tag,
            .alu_max_value = get_tag_max_value(MemoryTag::U16),
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, tag - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}
} // namespace
} // namespace bb::avm2::constraining
