#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

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

TEST(AluConstrainingTest, EmptyRow)
{
    check_relation<alu>(testing::empty_trace());
}

TEST(AluConstrainingTest, BasicAdd)
{
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 3,
            .alu_ic_tag = 2,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });

    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddFieldWithLookups)
{
    PrecomputedTraceBuilder precomputed_builder;
    // Using F here => alu_ix_tag = ValueTag::FF = 0, max_value = p - 1
    auto trace = TestTraceContainer::from_rows({
        // Note: tags are all 0, so not filling them here:
        {
            .alu_ia = 1,
            .alu_ib = 2,
            .alu_ic = 3,
            .alu_max_value = FF(-1),
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_register_0_ = 1,           // = ia
            .execution_register_1_ = 2,           // = ib
            .execution_register_2_ = 3,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 1);
    precomputed_builder.process_tag_parameters(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddU128WithLookups)
{
    PrecomputedTraceBuilder precomputed_builder;
    // Using u128 here => alu_ix_tag = ValueTag::U128 = 6, max_value = 2^128 - 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 6,
            .alu_ib = 2,
            .alu_ib_tag = 6,
            .alu_ic = 3,
            .alu_ic_tag = 6,
            .alu_max_value = (uint256_t(1) << 128) - 1,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_0_ = 6,            // = ia_tag
            .execution_mem_tag_1_ = 6,            // = ia_tag
            .execution_mem_tag_2_ = 6,            // = ia_tag
            .execution_register_0_ = 1,           // = ia
            .execution_register_1_ = 2,           // = ib
            .execution_register_2_ = 3,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 7);
    precomputed_builder.process_tag_parameters(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryWithLookups)
{
    PrecomputedTraceBuilder precomputed_builder;
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_value = 2^16 - 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = (1 << 16) - 2,
            .alu_ia_tag = 3,
            .alu_ib = 3,
            .alu_ib_tag = 3,
            .alu_ic = 1,
            .alu_ic_tag = 3,
            .alu_max_value = (1 << 16) - 1,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_0_ = 3,              // = ia_tag
            .execution_mem_tag_1_ = 3,              // = ia_tag
            .execution_mem_tag_2_ = 3,              // = ia_tag
            .execution_register_0_ = (1 << 16) - 2, // = ia
            .execution_register_1_ = 3,             // = ib
            .execution_register_2_ = 1,             // = ic
            .execution_sel_alu = 1,                 // = sel
            .execution_subtrace_operation_id = 1,   // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 4);
    precomputed_builder.process_tag_parameters(trace);
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU1WithLookups)
{
    PrecomputedTraceBuilder precomputed_builder;
    // Using u1s here => alu_ix_tag = ValueTag::U1 = 1, max_value = 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1,
            .alu_ia_tag = 1,
            .alu_ib = 1,
            .alu_ib_tag = 1,
            .alu_ic = 0,
            .alu_ic_tag = 1,
            .alu_max_value = 1,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .execution_mem_tag_0_ = 1,            // = ia_tag
            .execution_mem_tag_1_ = 1,            // = ia_tag
            .execution_mem_tag_2_ = 1,            // = ia_tag
            .execution_register_0_ = 1,           // = ia
            .execution_register_1_ = 1,           // = ib
            .execution_register_2_ = 0,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 2);
    precomputed_builder.process_tag_parameters(trace);
    check_interaction<AluTraceBuilder, lookup_alu_tag_max_value_settings>(trace);
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
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 3,
            .alu_ic_tag = 2,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });

    check_relation<alu>(trace);
    trace.set(Column::alu_ic, 0, 0);
    // If we are overflowing, we need to set the carry flag...
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST(AluConstrainingTest, NegativeAddCarryU1)
{
    PrecomputedTraceBuilder precomputed_builder;
    // Using u1s here => alu_ix_tag = ValueTag::U1 = 1, max_value = 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1,
            .alu_ia_tag = 1,
            .alu_ib = 1,
            .alu_ib_tag = 1,
            .alu_ic = 0,
            .alu_ic_tag = 1,
            .alu_max_value = 1,
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
    PrecomputedTraceBuilder precomputed_builder;
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2, max_value = 255
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 2,
            .alu_ia_tag = 2,
            .alu_ib = 255,
            .alu_ib_tag = 2,
            .alu_ic = 1,
            .alu_ic_tag = 2,
            .alu_max_value = 255,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 3);
    precomputed_builder.process_tag_parameters(trace);
    // The register lookup will pass (sel_alu = 0, not tested here):
    check_all_interactions<AluTraceBuilder>(trace);
    check_relation<alu>(trace);
    // TODO(MW): The below should fail the range check on c in memory, but we cannot test this yet.
    // Instead, we assume the carry flag is correct and show an overflow fails:
    trace.set(Column::alu_ic, 0, 257);
}

TEST(AluConstrainingTest, NegativeAddWrongTag)
{
    PrecomputedTraceBuilder precomputed_builder;
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_value = 2^16 - 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 2,
            .alu_ia_tag = 2, // Should be 3
            .alu_ib = 1,
            .alu_ib_tag = 2,
            .alu_ic = 3,
            .alu_ic_tag = 2,
            .alu_max_value = (1 << 16) - 1,
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
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_value = 2^16 - 1
    auto trace = TestTraceContainer::from_rows({
        {
            // ab_tags_diff_inv = inv(a_tag - b_tag) = inv(1) = 1:
            .alu_ab_tags_diff_inv = 1,
            .alu_ia = 2,
            .alu_ia_tag = 3,
            .alu_ib = 1,
            .alu_ib_tag = 2, // Should be 3
            .alu_ic = 3,
            .alu_ic_tag = 3,
            .alu_max_value = (1 << 16) - 1,
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
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_value = 2^16 - 1
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 2,
            .alu_ia_tag = 3,
            .alu_ib = 1,
            .alu_ib_tag = 3,
            .alu_ic = 3,
            .alu_ic_tag = 3,
            .alu_max_value = (1 << 16) - 1,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    check_relation<alu>(trace);
    trace.set(Column::alu_ic_tag, 0, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "C_TAG_CHECK");
}
} // namespace
} // namespace bb::avm2::constraining
