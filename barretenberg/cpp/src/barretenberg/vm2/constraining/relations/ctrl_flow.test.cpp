#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/registers.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;
using registers = bb::avm2::registers<FF>;

TEST(CtrlFlowConstrainingTest, Jump)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_sel_jump, 1 },
            { C::execution_rop_0_, 120 },
        },
        { { C::execution_sel, 1 }, { C::execution_last, 1 }, { C::execution_pc, 120 } },
    });

    check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_INT_CALL_JUMP);

    // Negative test: pc on next row is incorrect
    trace.set(C::execution_pc, 2, 121);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_INT_CALL_JUMP),
                              "PC_NEXT_ROW_INT_CALL_JUMP");
}

TEST(CtrlFlowConstrainingTest, JumpiTrueCondition)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::execution_sel, 1 },
          { C::execution_sel_jumpi, 1 },
          { C::execution_rop_1_, 120 },
          { C::execution_next_pc, 220 },
          { C::execution_register_0_, 1 } }, // True condition
        { { C::execution_sel, 1 }, { C::execution_last, 1 }, { C::execution_pc, 120 } },
    });

    check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_JUMPI);

    // Negative test: pc on next row is incorrect
    trace.set(C::execution_pc, 2, 220);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_JUMPI), "PC_NEXT_ROW_JUMPI");
}

TEST(CtrlFlowConstrainingTest, JumpiFalseCondition)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::execution_sel, 1 },
          { C::execution_sel_jumpi, 1 },
          { C::execution_rop_1_, 120 },
          { C::execution_next_pc, 220 },
          { C::execution_register_0_, 0 } }, // False condition
        { { C::execution_sel, 1 }, { C::execution_last, 1 }, { C::execution_pc, 220 } },
    });

    check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_JUMPI);

    // Negative test: pc on next row is incorrect
    trace.set(C::execution_pc, 2, 120);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_JUMPI), "PC_NEXT_ROW_JUMPI");
}

TEST(CtrlFlowConstrainingTest, JumpiWrongTag)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::execution_sel, 1 },
          { C::execution_sel_jumpi, 1 },
          { C::execution_sel_should_read_registers, 1 },
          { C::execution_sel_tag_check_reg_0_, 1 },
          { C::execution_mem_tag_reg_0_, 3 },
          { C::execution_expected_tag_reg_0_, 0 },
          { C::execution_sel_register_read_error, 1 },
          { C::execution_batched_tags_diff_inv_reg, FF(3).invert() } },
    });

    check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK);

    // Negative test: disable the error
    trace.set(C::execution_sel_register_read_error, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");

    // Negative test: in addition attempts to put zero in execution_batched_tags_diff_inv_reg
    trace.set(C::execution_batched_tags_diff_inv_reg, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
