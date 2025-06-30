#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/registers.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using registers = bb::avm2::registers<FF>;

TEST(RegistersConstrainingTest, EmptyRow)
{
    check_relation<registers>(testing::empty_trace());
}

TEST(RegistersConstrainingTest, EffectiveRegOpSelectorNoReadNoWrite)
{
    // This represents the case where we are not reading nor writing.
    TestTraceContainer trace({ {
        { C::execution_sel_should_read_registers, 0 },
        { C::execution_sel_should_write_registers, 0 },
        // Register 0: read, active.
        { C::execution_sel_mem_op_reg_0_, 1 },
        { C::execution_rw_reg_0_, 0 },
        { C::execution_sel_op_reg_effective_0_, 0 },
        // Register 1: write, active.
        { C::execution_sel_mem_op_reg_1_, 1 },
        { C::execution_rw_reg_1_, 1 },
        { C::execution_sel_op_reg_effective_1_, 0 },
        // Register 2: read, inactive.
        { C::execution_sel_mem_op_reg_2_, 0 },
        { C::execution_rw_reg_2_, 0 },
        { C::execution_sel_op_reg_effective_2_, 0 },
        // Register 3: write, inactive.
        { C::execution_sel_mem_op_reg_3_, 0 },
        { C::execution_rw_reg_3_, 1 },
        { C::execution_sel_op_reg_effective_3_, 0 },
    } });
    check_relation<registers>(trace,
                              registers::SR_SEL_OP_REG_EFFECTIVE_0,
                              registers::SR_SEL_OP_REG_EFFECTIVE_1,
                              registers::SR_SEL_OP_REG_EFFECTIVE_2,
                              registers::SR_SEL_OP_REG_EFFECTIVE_3);

    // Mismatch in effective selector should fail.
    trace.set(0,
              { {
                  { C::execution_sel_op_reg_effective_0_, 1 },
                  { C::execution_sel_op_reg_effective_1_, 1 },
                  { C::execution_sel_op_reg_effective_2_, 1 },
                  { C::execution_sel_op_reg_effective_3_, 1 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_0),
                              "SEL_OP_REG_EFFECTIVE_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_1),
                              "SEL_OP_REG_EFFECTIVE_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_2),
                              "SEL_OP_REG_EFFECTIVE_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_3),
                              "SEL_OP_REG_EFFECTIVE_3");
}

TEST(RegistersConstrainingTest, EffectiveRegOpSelectorOnlyRead)
{
    // This represents the case where we are only reading and failed before the write phase.
    TestTraceContainer trace({ {
        { C::execution_sel_should_read_registers, 1 },
        { C::execution_sel_should_write_registers, 0 },
        // Register 0: read, active.
        { C::execution_sel_mem_op_reg_0_, 1 },
        { C::execution_rw_reg_0_, 0 },
        { C::execution_sel_op_reg_effective_0_, 1 },
        // Register 1: write, active.
        { C::execution_sel_mem_op_reg_1_, 1 },
        { C::execution_rw_reg_1_, 1 },
        { C::execution_sel_op_reg_effective_1_, 0 }, // 0 since we are not writing.
        // Register 2: read, inactive.
        { C::execution_sel_mem_op_reg_2_, 0 },
        { C::execution_rw_reg_2_, 0 },
        { C::execution_sel_op_reg_effective_2_, 0 }, // Correct.
        // Register 3: write, inactive.
        { C::execution_sel_mem_op_reg_3_, 0 },
        { C::execution_rw_reg_3_, 1 },
        { C::execution_sel_op_reg_effective_3_, 0 }, // Correct.
    } });
    check_relation<registers>(trace,
                              registers::SR_SEL_OP_REG_EFFECTIVE_0,
                              registers::SR_SEL_OP_REG_EFFECTIVE_1,
                              registers::SR_SEL_OP_REG_EFFECTIVE_2,
                              registers::SR_SEL_OP_REG_EFFECTIVE_3,
                              registers::SR_SEL_OP_REG_EFFECTIVE_4,
                              registers::SR_SEL_OP_REG_EFFECTIVE_5,
                              registers::SR_SEL_OP_REG_EFFECTIVE_6);

    // Mismatch in effective selector should fail.
    trace.set(0,
              { {
                  { C::execution_sel_op_reg_effective_0_, 0 },
                  { C::execution_sel_op_reg_effective_1_, 1 },
                  { C::execution_sel_op_reg_effective_2_, 1 },
                  { C::execution_sel_op_reg_effective_3_, 1 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_0),
                              "SEL_OP_REG_EFFECTIVE_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_1),
                              "SEL_OP_REG_EFFECTIVE_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_2),
                              "SEL_OP_REG_EFFECTIVE_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_3),
                              "SEL_OP_REG_EFFECTIVE_3");
}

TEST(RegistersConstrainingTest, EffectiveRegOpSelectorReadThenWrite)
{
    // This represents the case where we are both reading and writing.
    TestTraceContainer trace({ {
        { C::execution_sel_should_read_registers, 1 },
        { C::execution_sel_should_write_registers, 1 },
        // Register 0: read, active.
        { C::execution_sel_mem_op_reg_0_, 1 },
        { C::execution_rw_reg_0_, 0 },
        { C::execution_sel_op_reg_effective_0_, 1 }, // Correct.
        // Register 1: write, active.
        { C::execution_sel_mem_op_reg_1_, 1 },
        { C::execution_rw_reg_1_, 1 },
        { C::execution_sel_op_reg_effective_1_, 1 }, // Correct.
        // Register 2: read, inactive.
        { C::execution_sel_mem_op_reg_2_, 0 },
        { C::execution_rw_reg_2_, 0 },
        { C::execution_sel_op_reg_effective_2_, 0 }, // Correct.
        // Register 3: write, inactive.
        { C::execution_sel_mem_op_reg_3_, 0 },
        { C::execution_rw_reg_3_, 1 },
        { C::execution_sel_op_reg_effective_3_, 0 }, // Correct.
    } });
    check_relation<registers>(trace,
                              registers::SR_SEL_OP_REG_EFFECTIVE_0,
                              registers::SR_SEL_OP_REG_EFFECTIVE_1,
                              registers::SR_SEL_OP_REG_EFFECTIVE_2,
                              registers::SR_SEL_OP_REG_EFFECTIVE_3);

    // Mismatch in effective selector should fail.
    trace.set(0,
              { {
                  { C::execution_sel_op_reg_effective_0_, 0 },
                  { C::execution_sel_op_reg_effective_1_, 0 },
                  { C::execution_sel_op_reg_effective_2_, 1 },
                  { C::execution_sel_op_reg_effective_3_, 1 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_0),
                              "SEL_OP_REG_EFFECTIVE_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_1),
                              "SEL_OP_REG_EFFECTIVE_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_2),
                              "SEL_OP_REG_EFFECTIVE_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_SEL_OP_REG_EFFECTIVE_3),
                              "SEL_OP_REG_EFFECTIVE_3");
}

TEST(RegistersConstrainingTest, TagCheckNoFailure)
{
    TestTraceContainer trace({
        {
            { C::execution_sel_should_read_registers, 1 },
            // Reg 0: check U8, is U8.
            { C::execution_sel_tag_check_reg_0_, 1 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
            { C::execution_expected_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
            // Reg 1: check U16, is U16.
            { C::execution_sel_tag_check_reg_1_, 1 },
            { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U16) },
            { C::execution_expected_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U16) },
            // Reg 2: not checked.
            { C::execution_sel_tag_check_reg_2_, 0 },
            { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::FF) },
            { C::execution_expected_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
            // Inverse
            { C::execution_batched_tags_diff_inv_reg, 0 }, // diff is 0.
            // No error
            { C::execution_sel_register_read_error, 0 },
        },
    });
    // This passes. Observe that `sel_mem_op_reg` doesn't matter for tag checking!
    check_relation<registers>(trace);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_register_read_error, /*row=*/0, /*value=*/1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");
}

TEST(RegistersConstrainingTest, TagCheckSingleFailure)
{
    FF batched_tags_diff =
        FF(1 << 0) * (FF(static_cast<uint8_t>(MemoryTag::FF)) - FF(static_cast<uint8_t>(MemoryTag::U8)));

    TestTraceContainer trace({
        {
            { C::execution_sel_should_read_registers, 1 },
            // Reg 0: check U8, is FF -> FAILURE
            { C::execution_sel_tag_check_reg_0_, 1 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
            { C::execution_expected_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
            // No error
            { C::execution_sel_register_read_error, 1 },
            { C::execution_batched_tags_diff_inv_reg, batched_tags_diff.invert() },
        },
    });

    check_relation<registers>(trace);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_register_read_error, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");

    // Should fail if inverse is wrong.
    trace.set(C::execution_batched_tags_diff_inv_reg, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");
}

TEST(RegistersConstrainingTest, TagCheckIgnoresFailureWhenNotReading)
{
    TestTraceContainer trace({
        {
            { C::execution_sel_should_read_registers, 0 },
            // Reg 0: check U8, is FF -> FAILURE
            { C::execution_sel_tag_check_reg_0_, 1 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
            { C::execution_expected_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
            // No error
            { C::execution_sel_register_read_error, 0 },
            { C::execution_batched_tags_diff_inv_reg, 0 },
        },
    });
    check_relation<registers>(trace);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_register_read_error, /*row=*/0, /*value=*/1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");
}

TEST(RegistersConstrainingTest, TagCheckMultipleFailures)
{
    FF batched_tags_diff =
        FF(1 << 0) * (FF(static_cast<uint8_t>(MemoryTag::FF)) - FF(static_cast<uint8_t>(MemoryTag::U8))) +
        FF(1 << 3) * (FF(static_cast<uint8_t>(MemoryTag::U16)) - FF(static_cast<uint8_t>(MemoryTag::U32)));

    TestTraceContainer trace({
        {
            { C::execution_sel_should_read_registers, 1 },
            // Reg 0: check U8, is FF -> FAILURE
            { C::execution_sel_tag_check_reg_0_, 1 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
            { C::execution_expected_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
            // Reg 1: check U32, is U16 -> FAILURE
            { C::execution_sel_tag_check_reg_1_, 1 },
            { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U16) },
            { C::execution_expected_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U32) },
            // Reg 2: check U8, is U8 -> SUCCESS
            { C::execution_sel_tag_check_reg_2_, 1 },
            { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
            { C::execution_expected_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
            // No error
            { C::execution_sel_register_read_error, 1 },
            { C::execution_batched_tags_diff_inv_reg, batched_tags_diff.invert() },
        },
    });
    check_relation<registers>(trace);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_register_read_error, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");

    // Should fail if inverse is wrong.
    trace.set(C::execution_batched_tags_diff_inv_reg, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              "REGISTER_READ_TAG_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
