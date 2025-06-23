#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/alu.hpp"
#include "barretenberg/vm2/generated/relations/lookups_alu.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using alu = bb::avm2::alu<FF>;
using tracegen::AluTraceBuilder;

TEST(AluConstrainingTest, EmptyRow)
{
    check_relation<alu>(testing::empty_trace());
}

TEST(AluConstrainingTest, BasicAdd)
{
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2, max_bits = 8
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 3,
            .alu_ic_tag = 2,
            .alu_max_bits = 8,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_tag_minus_1_inv = 1,
        },
    });

    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarry)
{
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_bits = 16, max_value = 1 << 16
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1 << 16,
            .alu_ia_tag = 3,
            .alu_ib = 1,
            .alu_ib_tag = 3,
            .alu_ic = 1,
            .alu_ic_tag = 3,
            .alu_max_bits = 16,
            .alu_max_value = 1 << 16,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_tag_minus_1_inv = FF(2).invert(),
        },
    });

    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddWithRegisterLookup)
{
    // TODO(MW): Add big test with all lookups?
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2, max_bits = 8
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 3,
            .alu_ic_tag = 2,
            .alu_max_bits = 8,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_tag_minus_1_inv = 1,
            .execution_mem_tag_0_ = 2,            // = ia_tag
            .execution_mem_tag_1_ = 2,            // = ia_tag
            .execution_mem_tag_2_ = 2,            // = ia_tag
            .execution_register_0_ = 1,           // = ia
            .execution_register_1_ = 2,           // = ib
            .execution_register_2_ = 3,           // = ic
            .execution_sel_alu = 1,               // = sel
            .execution_subtrace_operation_id = 1, // = alu_op_id
        },
    });

    check_interaction<AluTraceBuilder, lookup_alu_value_tag_lookup_settings>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, BasicAddWithRangeLookup)
{
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2, max_bits = 8
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 1,
            .alu_ia_tag = 2,
            .alu_ib = 2,
            .alu_ib_tag = 2,
            .alu_ic = 3,
            .alu_ic_tag = 2,
            .alu_max_bits = 8,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_tag_minus_1_inv = 1,
            .range_check_rng_chk_bits = 8, // = max_bits
            .range_check_sel = 1,
            .range_check_value = 3, // = ic
        },
    });

    check_interaction<AluTraceBuilder, lookup_alu_c_range_check_settings>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryWithTagBitsLookup)
{
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_bits = 16, max_value = 1 << 16
    auto trace = TestTraceContainer::from_rows({
        {
            .precomputed_clk = 16,             // = max_bits
            .precomputed_power_of_2 = 1 << 16, // = max_value
            .precomputed_sel_range_8 = 1,
            .alu_cf = 1, // Note: we only need this lookup when we overflow
            .alu_ia = 1 << 16,
            .alu_ia_tag = 3,
            .alu_ib = 1,
            .alu_ib_tag = 3,
            .alu_ic = 1,
            .alu_ic_tag = 3,
            .alu_max_bits = 16,
            .alu_max_value = 1 << 16,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_tag_minus_1_inv = FF(2).invert(),

        },
    });

    check_interaction<AluTraceBuilder, lookup_alu_tag_bits_lookup_settings>(trace);
    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, AddCarryU1WithTagBitsLookup)
{
    // Note: u1 is a special case, so testing separately:
    // Using u1s here => alu_ix_tag = ValueTag::U1 = 1, max_bits = 1, max_value = 2
    auto trace = TestTraceContainer::from_rows({
        {
            .precomputed_clk = 1,        // = max_bits
            .precomputed_power_of_2 = 2, // = max_value
            .precomputed_sel_range_8 = 1,
            .alu_cf = 1, // Note: we only need this lookup when we overflow
            .alu_ia = 1,
            .alu_ia_tag = 1,
            .alu_ib = 1,
            .alu_ib_tag = 1,
            .alu_ic = 0,
            .alu_ic_tag = 1,
            .alu_is_u1 = 1,
            .alu_max_bits = 1,
            .alu_max_value = 2,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });

    check_interaction<AluTraceBuilder, lookup_alu_tag_bits_lookup_settings>(trace);
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

TEST(AluConstrainingTest, NegativeAdd)
{
    // TODO(MW): rework/remove
    auto trace = TestTraceContainer::from_rows({
        {
            // Wrong ADD.
            .alu_ia = 1,
            .alu_ib = 1,
            .alu_ic = 0,
            // Observe that I'm making subrelation SEL_ADD_BINARY fail too, but we'll only check subrelation ALU_ADD!
            .alu_sel_op_add = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_ALU_ADD), "ALU_ADD");
}

TEST(AluConstrainingTest, NegativeAddCarryU1WrongFlag)
{
    // Using u1s here => alu_ix_tag = ValueTag::U1 = 1, max_bits = 1, max_value = 2
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1,
            .alu_ia_tag = 1,
            .alu_ib = 1,
            .alu_ib_tag = 1,
            .alu_ic = 0,
            .alu_ic_tag = 1,
            .alu_is_u1 = 1,
            .alu_max_bits = 1,
            .alu_max_value = 2,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    check_relation<alu>(trace);
    trace.set(Column::alu_is_u1, 0, 0);
    // We need to set that we are using u1, as it's a special case for bit size:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_IS_U1_CHECK");
}

TEST(AluConstrainingTest, NegativeAddCarryU1WrongCarry)
{
    // Using u1s here => alu_ix_tag = ValueTag::U1 = 1, max_bits = 1, max_value = 2
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_cf = 1,
            .alu_ia = 1,
            .alu_ia_tag = 1,
            .alu_ib = 1,
            .alu_ib_tag = 1,
            .alu_ic = 0,
            .alu_ic_tag = 1,
            .alu_is_u1 = 1,
            .alu_max_bits = 1,
            .alu_max_value = 2,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
        },
    });
    check_relation<alu>(trace);
    trace.set(Column::alu_cf, 0, 0);
    // If we are overflowing, we need to set the carry flag...
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");

    trace.set(Column::alu_cf, 0, 1);
    trace.set(Column::alu_max_value, 0, 0);
    // ...and the correct max_value:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "ALU_ADD");
}

TEST(AluConstrainingTest, NegativeBasicAddWrongInverse)
{
    // Using u16s here => alu_ix_tag = ValueTag::U16 = 3, max_bits = 16, max_value = 1 << 16
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia = 2,
            .alu_ia_tag = 3,
            .alu_ib = 1,
            .alu_ib_tag = 3,
            .alu_ic = 3,
            .alu_ic_tag = 3,
            .alu_max_bits = 16,
            .alu_op_id = 1,
            .alu_sel = 1,
            .alu_sel_op_add = 1,
            .alu_tag_minus_1_inv = FF(23).invert(), // Should be inv(tag - 1) = inv(2)

        },
    });
    // Though we correctly 'set' is_u1 = 0, the relation to check it relies on the inverse being correct:
    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace), "TAG_IS_U1_CHECK");
}

TEST(AluConstrainingTest, NegativeBasicAddWrongBits)
{
    // Using u8s here => alu_ix_tag = ValueTag::U8 = 2, max_bits = 8
    auto trace = TestTraceContainer::from_rows({
        {
            .alu_ia_tag = 2,
            .alu_max_bits = 16, // Should be 8
            .alu_sel = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_TAG_BITS_CHECK), "TAG_BITS_CHECK");
}
} // namespace
} // namespace bb::avm2::constraining
