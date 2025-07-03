#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/addressing.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using addressing = bb::avm2::addressing<FF>;

// Across all tests, bear in mind that
// pol SEL_SHOULD_RESOLVE_ADDRESS = sel_bytecode_retrieval_success * sel_instruction_fetching_success;

TEST(AddressingConstrainingTest, EmptyRow)
{
    check_relation<addressing>(testing::empty_trace());
}

/**************************************************************************************************
 *  Base Address Resolution
 **************************************************************************************************/

TEST(AddressingConstrainingTest, BaseAddressGating)
{
    // If the are no relative operands, it's ok that sel_do_base_check is 0.
    TestTraceContainer trace({ {
        // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
        // If this is off the whole subrelation is unconstrained.
        { C::execution_sel_bytecode_retrieval_success, 1 },
        { C::execution_sel_instruction_fetching_success, 1 },
    } });
    check_relation<addressing>(trace, addressing::SR_NUM_RELATIVE_INV_CHECK);

    trace.set(0,
              { {
                  // From spec.
                  { C::execution_sel_op_is_address_0_, 1 },
                  { C::execution_sel_op_is_address_1_, 1 },
                  { C::execution_sel_op_is_address_2_, 1 },
                  { C::execution_sel_op_is_address_3_, 1 },
                  { C::execution_sel_op_is_address_4_, 0 },
                  { C::execution_sel_op_is_address_5_, 0 },
                  { C::execution_sel_op_is_address_6_, 0 },
                  // Frmo indirect.
                  { C::execution_sel_op_is_relative_wire_0_, 1 },
                  { C::execution_sel_op_is_relative_wire_1_, 0 },
                  { C::execution_sel_op_is_relative_wire_2_, 1 },
                  { C::execution_sel_op_is_relative_wire_3_, 0 },
                  { C::execution_sel_op_is_relative_wire_4_, 1 }, // not an address
                  { C::execution_sel_op_is_relative_wire_5_, 0 },
                  { C::execution_sel_op_is_relative_wire_6_, 0 },
                  // Derived.
                  { C::execution_sel_op_is_relative_effective_0_, 1 },
                  { C::execution_sel_op_is_relative_effective_1_, 0 },
                  { C::execution_sel_op_is_relative_effective_2_, 1 },
                  { C::execution_sel_op_is_relative_effective_3_, 0 },
                  { C::execution_sel_op_is_relative_effective_4_, 0 },
                  { C::execution_sel_op_is_relative_effective_5_, 0 },
                  { C::execution_sel_op_is_relative_effective_6_, 0 },
                  // should be 1
                  { C::execution_sel_do_base_check, 0 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NUM_RELATIVE_INV_CHECK),
                              "NUM_RELATIVE_INV_CHECK");

    // Even if we fix the inverse, sel_do_base_check should still be 1 and not 0.
    trace.set(C::execution_num_relative_operands_inv, /*row=*/0, /*value=*/FF(2).invert());
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NUM_RELATIVE_INV_CHECK),
                              "NUM_RELATIVE_INV_CHECK");

    // Now it should pass.
    trace.set(C::execution_sel_do_base_check, /*row=*/0, /*value=*/1);
    check_relation<addressing>(trace, addressing::SR_NUM_RELATIVE_INV_CHECK);
}

TEST(AddressingConstrainingTest, BaseAddressTagIsU32)
{
    FF base_address_tag = FF(static_cast<uint8_t>(MemoryTag::U32));
    FF base_address_tag_diff_inv = 0;

    TestTraceContainer trace({
        {
            { C::execution_base_address_tag, base_address_tag },
            { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
            { C::execution_sel_base_address_failure, 0 },
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
            { C::execution_sel_do_base_check, 1 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK);

    // Error selector cannot be cheated.
    trace.set(C::execution_sel_base_address_failure, /*row=*/0, /*value=*/1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK),
                              "BASE_ADDRESS_CHECK");

    // Inverse doesn't matter if the base address tag is U32.
    trace.set(0,
              { {
                  { C::execution_base_address_tag_diff_inv, 44 },
                  { C::execution_sel_base_address_failure, 0 },
              } });
    check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK);
}

TEST(AddressingConstrainingTest, BaseAddressTagIsNotU32)
{
    FF base_address_tag = 1234567;
    FF u32_tag = static_cast<uint8_t>(MemoryTag::U32);
    FF base_address_tag_diff_inv = FF(base_address_tag - u32_tag).invert();

    TestTraceContainer trace({
        {
            { C::execution_base_address_tag, base_address_tag },
            { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
            { C::execution_sel_base_address_failure, 1 },
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
            { C::execution_sel_do_base_check, 1 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK);

    // Error selector cannot be cheated.
    trace.set(C::execution_sel_base_address_failure, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK),
                              "BASE_ADDRESS_CHECK");

    // Inverse cannot be cheated if the base address tag is not U32.
    trace.set(0,
              { {
                  { C::execution_base_address_tag_diff_inv, 0 },
                  { C::execution_sel_base_address_failure, 0 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK),
                              "BASE_ADDRESS_CHECK");
}

TEST(AddressingConstrainingTest, BaseAddressTagNoCheckImpliesNoError)
{
    FF base_address_tag = 1234567;
    FF u32_tag = static_cast<uint8_t>(MemoryTag::U32);
    FF base_address_tag_diff_inv = FF(base_address_tag - u32_tag).invert();

    TestTraceContainer trace({
        {
            { C::execution_base_address_tag, base_address_tag },
            { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
            { C::execution_sel_base_address_failure, 0 },
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
            { C::execution_sel_do_base_check, 0 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK);

    // Error selector cannot be cheated.
    trace.set(C::execution_sel_base_address_failure, /*row=*/0, /*value=*/1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK),
                              "BASE_ADDRESS_CHECK");

    // Check should not be done if sel_should_resolve_address is 0. Even if there are relative addresses.
    // Therefore the above case that was failing should now pass.
    trace.set(0,
              { {
                  // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
                  { C::execution_sel_bytecode_retrieval_success, 0 },
                  { C::execution_sel_instruction_fetching_success, 0 },
                  //
                  { C::execution_sel_do_base_check, 1 },
              } });
    check_relation<addressing>(trace, addressing::SR_BASE_ADDRESS_CHECK);
}

/**************************************************************************************************
 *  Relative Address Resolution
 **************************************************************************************************/

TEST(AddressingConstrainingTest, RelativeAddressPropagation)
{
    FF base_address_val = 100;

    TestTraceContainer trace({
        {
            { C::execution_base_address_val, base_address_val },
            { C::execution_sel_base_address_failure, 0 },
            // Original operands.
            { C::execution_op_0_, 123 },
            { C::execution_op_1_, 456 },
            { C::execution_op_2_, /*2^32 - 1*/ 0xFFFFFFFF },
            { C::execution_op_3_, 101112 },
            { C::execution_op_4_, 131415 },
            { C::execution_op_5_, 161718 },
            { C::execution_op_6_, 192021 },
            // After relative step.
            { C::execution_op_after_relative_0_, FF(123) + base_address_val },
            { C::execution_op_after_relative_1_, 456 },
            { C::execution_op_after_relative_2_, FF(0xFFFFFFFF) + base_address_val },
            { C::execution_op_after_relative_3_, 101112 },
            { C::execution_op_after_relative_4_, FF(131415) + base_address_val },
            { C::execution_op_after_relative_5_, 161718 },
            { C::execution_op_after_relative_6_, FF(192021) + base_address_val },
            // From spec.
            { C::execution_sel_op_is_address_0_, 1 },
            { C::execution_sel_op_is_address_1_, 1 },
            { C::execution_sel_op_is_address_2_, 1 },
            { C::execution_sel_op_is_address_3_, 1 },
            { C::execution_sel_op_is_address_4_, 1 },
            { C::execution_sel_op_is_address_5_, 1 },
            { C::execution_sel_op_is_address_6_, 1 },
            // Derived.
            { C::execution_sel_op_is_relative_effective_0_, 1 },
            { C::execution_sel_op_is_relative_effective_1_, 0 },
            { C::execution_sel_op_is_relative_effective_2_, 1 },
            { C::execution_sel_op_is_relative_effective_3_, 0 },
            { C::execution_sel_op_is_relative_effective_4_, 1 },
            { C::execution_sel_op_is_relative_effective_5_, 0 },
            { C::execution_sel_op_is_relative_effective_6_, 1 },
            // Selectors that enable the subrelation.
            { C::execution_sel_op_is_relative_wire_0_, 1 },
            { C::execution_sel_op_is_relative_wire_1_, 0 },
            { C::execution_sel_op_is_relative_wire_2_, 1 },
            { C::execution_sel_op_is_relative_wire_3_, 0 },
            { C::execution_sel_op_is_relative_wire_4_, 1 },
            { C::execution_sel_op_is_relative_wire_5_, 0 },
            { C::execution_sel_op_is_relative_wire_6_, 1 },
        },
    });

    check_relation<addressing>(trace,
                               addressing::SR_RELATIVE_RESOLUTION_0,
                               addressing::SR_RELATIVE_RESOLUTION_1,
                               addressing::SR_RELATIVE_RESOLUTION_2,
                               addressing::SR_RELATIVE_RESOLUTION_3,
                               addressing::SR_RELATIVE_RESOLUTION_4,
                               addressing::SR_RELATIVE_RESOLUTION_5,
                               addressing::SR_RELATIVE_RESOLUTION_6);

    // We set wrong values.
    trace.set(0,
              { {
                  { C::execution_op_after_relative_0_, 7 },
                  { C::execution_op_after_relative_1_, FF(456) + base_address_val },
                  { C::execution_op_after_relative_2_, 0xFFFFFFFF },
                  { C::execution_op_after_relative_3_, 7 },
                  { C::execution_op_after_relative_4_, 7 },
                  { C::execution_op_after_relative_5_, FF(161718) + base_address_val },
                  { C::execution_op_after_relative_6_, 192021 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_0),
                              "RELATIVE_RESOLUTION_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_1),
                              "RELATIVE_RESOLUTION_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_2),
                              "RELATIVE_RESOLUTION_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_3),
                              "RELATIVE_RESOLUTION_3");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_4),
                              "RELATIVE_RESOLUTION_4");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_5),
                              "RELATIVE_RESOLUTION_5");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_6),
                              "RELATIVE_RESOLUTION_6");
}

TEST(AddressingConstrainingTest, RelativeAddressPropagationWhenBaseAddressIsInvalid)
{
    FF base_address_val = 0x123456789012345ULL;

    TestTraceContainer trace({
        {
            { C::execution_base_address_val, base_address_val },
            { C::execution_sel_base_address_failure, 1 },
            // Original operands.
            { C::execution_op_0_, 123 },
            { C::execution_op_1_, 456 },
            { C::execution_op_2_, 0xFFFFFFFF /*2^32 - 1*/ },
            { C::execution_op_3_, 101112 },
            { C::execution_op_4_, 131415 },
            { C::execution_op_5_, 161718 },
            { C::execution_op_6_, 192021 },
            // After relative step. Base address was not added.
            { C::execution_op_after_relative_0_, 123 },
            { C::execution_op_after_relative_1_, 456 },
            { C::execution_op_after_relative_2_, 0xFFFFFFFF },
            { C::execution_op_after_relative_3_, 101112 },
            { C::execution_op_after_relative_4_, 131415 },
            { C::execution_op_after_relative_5_, 161718 },
            { C::execution_op_after_relative_6_, 192021 },
            // From spec.
            { C::execution_sel_op_is_address_0_, 1 },
            { C::execution_sel_op_is_address_1_, 1 },
            { C::execution_sel_op_is_address_2_, 1 },
            { C::execution_sel_op_is_address_3_, 1 },
            { C::execution_sel_op_is_address_4_, 1 },
            { C::execution_sel_op_is_address_5_, 1 },
            { C::execution_sel_op_is_address_6_, 1 },
            // Selectors that enable the subrelation.
            { C::execution_sel_op_is_relative_wire_0_, 1 },
            { C::execution_sel_op_is_relative_wire_1_, 0 },
            { C::execution_sel_op_is_relative_wire_2_, 1 },
            { C::execution_sel_op_is_relative_wire_3_, 0 },
            { C::execution_sel_op_is_relative_wire_4_, 1 },
            { C::execution_sel_op_is_relative_wire_5_, 0 },
            { C::execution_sel_op_is_relative_wire_6_, 1 },
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
        },
    });

    check_relation<addressing>(trace,
                               addressing::SR_RELATIVE_RESOLUTION_0,
                               addressing::SR_RELATIVE_RESOLUTION_1,
                               addressing::SR_RELATIVE_RESOLUTION_2,
                               addressing::SR_RELATIVE_RESOLUTION_3,
                               addressing::SR_RELATIVE_RESOLUTION_4,
                               addressing::SR_RELATIVE_RESOLUTION_5,
                               addressing::SR_RELATIVE_RESOLUTION_6);

    // If I try to add the base address, the relation should fail.
    trace.set(C::execution_op_after_relative_0_, /*row=*/0, /*value=*/FF(123) + base_address_val);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_RESOLUTION_0),
                              "RELATIVE_RESOLUTION_0");
}

TEST(AddressingConstrainingTest, RelativeOverflowCheck)
{
    FF base_address_val = 100;
    FF two_to_32 = FF(1ULL << 32);

    TestTraceContainer trace({
        {
            // Derived.
            { C::execution_sel_op_is_relative_effective_0_, 1 },
            { C::execution_sel_op_is_relative_effective_1_, 0 },
            { C::execution_sel_op_is_relative_effective_2_, 1 },
            { C::execution_sel_op_is_relative_effective_3_, 0 },
            { C::execution_sel_op_is_relative_effective_4_, 1 },
            { C::execution_sel_op_is_relative_effective_5_, 0 },
            { C::execution_sel_op_is_relative_effective_6_, 1 },
            // After relative step. Base address was added when applicable.
            { C::execution_op_after_relative_0_, FF(123) + base_address_val },
            { C::execution_op_after_relative_1_, 456 },
            { C::execution_op_after_relative_2_, FF(0xFFFFFFFF) + base_address_val },
            { C::execution_op_after_relative_3_, 101112 },
            { C::execution_op_after_relative_4_, FF(131415) + base_address_val },
            { C::execution_op_after_relative_5_, 161718 },
            { C::execution_op_after_relative_6_, FF(192021) + base_address_val },
            // Overflow bits.
            { C::execution_sel_relative_overflow_0_, 0 },
            { C::execution_sel_relative_overflow_1_, 0 },
            { C::execution_sel_relative_overflow_2_, 1 },
            { C::execution_sel_relative_overflow_3_, 0 },
            { C::execution_sel_relative_overflow_4_, 0 },
            { C::execution_sel_relative_overflow_5_, 0 },
            { C::execution_sel_relative_overflow_6_, 0 },
            // Intermediary columns.
            { C::execution_overflow_range_check_result_0_, two_to_32 - (FF(123) + base_address_val) - 1 },
            { C::execution_overflow_range_check_result_1_, 0 }, // N/A due to not relative effective.
            { C::execution_overflow_range_check_result_2_, (FF(0xFFFFFFFF) + base_address_val) - two_to_32 },
            { C::execution_overflow_range_check_result_3_, 0 }, // N/A due to not relative effective.
            { C::execution_overflow_range_check_result_4_, two_to_32 - (FF(131415) + base_address_val) - 1 },
            { C::execution_overflow_range_check_result_5_, 0 }, // N/A due to not relative effective.
            { C::execution_overflow_range_check_result_6_, two_to_32 - (FF(192021) + base_address_val) - 1 },
            // Sigh...
            { C::execution_two_to_32, two_to_32 },
        },
    });

    check_relation<addressing>(trace,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_0,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_1,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_2,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_3,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_4,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_5,
                               addressing::SR_RELATIVE_OVERFLOW_RESULT_6,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_0,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_1,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_2,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_3,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_4,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_5,
                               addressing::SR_NOT_RELATIVE_NO_OVERFLOW_6);

    // If we swap bits it should fail.
    trace.set(0,
              { {
                  { C::execution_sel_relative_overflow_0_, 1 }, // No overflow.
                  { C::execution_sel_relative_overflow_1_, 1 }, // Wasn't relative effective.
                  { C::execution_sel_relative_overflow_2_, 0 }, // Overflow.
                  { C::execution_sel_relative_overflow_3_, 1 }, // Wasn't relative effective.
                  { C::execution_sel_relative_overflow_4_, 1 }, // No overflow.
                  { C::execution_sel_relative_overflow_5_, 1 }, // Wasn't relative effective.
                  { C::execution_sel_relative_overflow_6_, 1 }, // No overflow.
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_OVERFLOW_RESULT_0),
                              "RELATIVE_OVERFLOW_RESULT_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NOT_RELATIVE_NO_OVERFLOW_1),
                              "NOT_RELATIVE_NO_OVERFLOW_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_OVERFLOW_RESULT_2),
                              "RELATIVE_OVERFLOW_RESULT_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NOT_RELATIVE_NO_OVERFLOW_3),
                              "NOT_RELATIVE_NO_OVERFLOW_3");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_OVERFLOW_RESULT_4),
                              "RELATIVE_OVERFLOW_RESULT_4");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NOT_RELATIVE_NO_OVERFLOW_5),
                              "NOT_RELATIVE_NO_OVERFLOW_5");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_RELATIVE_OVERFLOW_RESULT_6),
                              "RELATIVE_OVERFLOW_RESULT_6");
}

/**************************************************************************************************
 *  Indirect Resolution
 **************************************************************************************************/

TEST(AddressingConstrainingTest, IndirectReconstruction)
{
    TestTraceContainer trace({
        {
            { C::execution_indirect, 0b11'00'01'00'01'11'01'01 },
            { C::execution_sel_op_is_indirect_wire_0_, 1 },
            { C::execution_sel_op_is_relative_wire_0_, 0 },
            { C::execution_sel_op_is_indirect_wire_1_, 1 },
            { C::execution_sel_op_is_relative_wire_1_, 0 },
            { C::execution_sel_op_is_indirect_wire_2_, 1 },
            { C::execution_sel_op_is_relative_wire_2_, 1 },
            { C::execution_sel_op_is_indirect_wire_3_, 1 },
            { C::execution_sel_op_is_relative_wire_3_, 0 },
            { C::execution_sel_op_is_indirect_wire_4_, 0 },
            { C::execution_sel_op_is_relative_wire_4_, 0 },
            { C::execution_sel_op_is_indirect_wire_5_, 1 },
            { C::execution_sel_op_is_relative_wire_5_, 0 },
            { C::execution_sel_op_is_indirect_wire_6_, 0 },
            { C::execution_sel_op_is_relative_wire_6_, 0 },
            { C::execution_sel_op_is_relative_wire_7_, 1 },
            { C::execution_sel_op_is_indirect_wire_7_, 1 },
            // Selectors that enable the subrelation.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_INDIRECT_RECONSTRUCTION);
}

TEST(AddressingConstrainingTest, IndirectReconstructionZeroWhenAddressingDisabled)
{
    TestTraceContainer trace({
        {
            { C::execution_indirect, 123456 },
            // All sel_op_indirect and sel_op_is_relative are 0.
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 0 },
            { C::execution_sel_instruction_fetching_success, 0 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_INDIRECT_RECONSTRUCTION);

    // If we set any to non-zero, the relation should fail.
    constexpr std::array<Column, 16> decomposition_columns = {
        C::execution_sel_op_is_indirect_wire_0_, C::execution_sel_op_is_relative_wire_0_,
        C::execution_sel_op_is_indirect_wire_1_, C::execution_sel_op_is_relative_wire_1_,
        C::execution_sel_op_is_indirect_wire_2_, C::execution_sel_op_is_relative_wire_2_,
        C::execution_sel_op_is_indirect_wire_3_, C::execution_sel_op_is_relative_wire_3_,
        C::execution_sel_op_is_indirect_wire_4_, C::execution_sel_op_is_relative_wire_4_,
        C::execution_sel_op_is_indirect_wire_5_, C::execution_sel_op_is_relative_wire_5_,
        C::execution_sel_op_is_indirect_wire_6_, C::execution_sel_op_is_relative_wire_6_,
        C::execution_sel_op_is_relative_wire_7_, C::execution_sel_op_is_indirect_wire_7_
    };
    for (Column sel_on : decomposition_columns) {
        // First set everything to 0
        for (Column c : decomposition_columns) {
            trace.set(c, /*row=*/0, /*value=*/0);
        }
        // Enable one column.
        trace.set(sel_on, /*row=*/0, /*value=*/1);
        EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_RECONSTRUCTION),
                                  "INDIRECT_RECONSTRUCTION");
    }
}

TEST(AddressingConstrainingTest, IndirectGating)
{
    TestTraceContainer trace({
        {
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
            // From wire.
            { C::execution_sel_op_is_indirect_wire_0_, 0 },
            { C::execution_sel_op_is_indirect_wire_1_, 1 },
            { C::execution_sel_op_is_indirect_wire_2_, 0 },
            { C::execution_sel_op_is_indirect_wire_3_, 1 },
            { C::execution_sel_op_is_indirect_wire_4_, 0 },
            { C::execution_sel_op_is_indirect_wire_5_, 1 },
            { C::execution_sel_op_is_indirect_wire_6_, 1 },
            // From spec.
            { C::execution_sel_op_is_address_0_, 1 },
            { C::execution_sel_op_is_address_1_, 1 },
            { C::execution_sel_op_is_address_2_, 1 },
            { C::execution_sel_op_is_address_3_, 1 },
            { C::execution_sel_op_is_address_4_, 1 },
            { C::execution_sel_op_is_address_5_, 1 },
            { C::execution_sel_op_is_address_6_, 0 },
            // From relative step.
            { C::execution_sel_relative_overflow_0_, 0 },
            { C::execution_sel_relative_overflow_1_, 0 },
            { C::execution_sel_relative_overflow_2_, 1 },
            { C::execution_sel_relative_overflow_3_, 1 },
            { C::execution_sel_relative_overflow_4_, 0 },
            { C::execution_sel_relative_overflow_5_, 0 },
            { C::execution_sel_relative_overflow_6_, 0 },
            // Expected.
            { C::execution_sel_should_apply_indirection_0_, 0 }, // no indirect bit
            { C::execution_sel_should_apply_indirection_1_, 1 }, // indirect
            { C::execution_sel_should_apply_indirection_2_, 0 }, // no indirect and relative overflowed
            { C::execution_sel_should_apply_indirection_3_, 0 }, // indirect and relative overflowed
            { C::execution_sel_should_apply_indirection_4_, 0 }, // no indirect and no relative overflow
            { C::execution_sel_should_apply_indirection_5_, 1 }, // indirect and no relative overflow
            { C::execution_sel_should_apply_indirection_6_, 0 }, // indirect and no overflow but also not an address
        },
    });

    check_relation<addressing>(trace,
                               addressing::SR_INDIRECT_GATING_0,
                               addressing::SR_INDIRECT_GATING_1,
                               addressing::SR_INDIRECT_GATING_2,
                               addressing::SR_INDIRECT_GATING_3,
                               addressing::SR_INDIRECT_GATING_4,
                               addressing::SR_INDIRECT_GATING_5,
                               addressing::SR_INDIRECT_GATING_6);

    // Expect failures if we switch bits.
    trace.set(0,
              { {
                  // Opposite of above.
                  { C::execution_sel_should_apply_indirection_0_, 1 },
                  { C::execution_sel_should_apply_indirection_1_, 0 },
                  { C::execution_sel_should_apply_indirection_2_, 1 },
                  { C::execution_sel_should_apply_indirection_3_, 1 },
                  { C::execution_sel_should_apply_indirection_4_, 1 },
                  { C::execution_sel_should_apply_indirection_5_, 0 },
                  { C::execution_sel_should_apply_indirection_6_, 1 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_0), "INDIRECT_GATING_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_1), "INDIRECT_GATING_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_2), "INDIRECT_GATING_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_3), "INDIRECT_GATING_3");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_4), "INDIRECT_GATING_4");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_5), "INDIRECT_GATING_5");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_6), "INDIRECT_GATING_6");

    // Bits are still constrained if SEL_SHOULD_RESOLVE_ADDRESS is 0.
    // This just simplifies the relation.
    trace.set(C::execution_sel_bytecode_retrieval_success, /*row=*/0, /*value=*/0);
    trace.set(C::execution_sel_instruction_fetching_success, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_0), "INDIRECT_GATING_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_1), "INDIRECT_GATING_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_2), "INDIRECT_GATING_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_3), "INDIRECT_GATING_3");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_4), "INDIRECT_GATING_4");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_5), "INDIRECT_GATING_5");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_6), "INDIRECT_GATING_6");
}

TEST(AddressingConstrainingTest, IndirectGatingIfBaseAddressIsInvalid)
{
    TestTraceContainer trace({
        {
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
            //
            { C::execution_sel_base_address_failure, 1 },
            // From wire.
            { C::execution_sel_op_is_indirect_wire_0_, 0 },
            { C::execution_sel_op_is_indirect_wire_1_, 1 },
            { C::execution_sel_op_is_indirect_wire_2_, 0 },
            { C::execution_sel_op_is_indirect_wire_3_, 1 },
            { C::execution_sel_op_is_indirect_wire_4_, 0 },
            { C::execution_sel_op_is_indirect_wire_5_, 1 },
            { C::execution_sel_op_is_indirect_wire_6_, 1 },
            // From spec.
            { C::execution_sel_op_is_address_0_, 1 },
            { C::execution_sel_op_is_address_1_, 1 },
            { C::execution_sel_op_is_address_2_, 1 },
            { C::execution_sel_op_is_address_3_, 1 },
            { C::execution_sel_op_is_address_4_, 1 },
            { C::execution_sel_op_is_address_5_, 1 },
            { C::execution_sel_op_is_address_6_, 0 },
            // From relative step.
            { C::execution_sel_relative_overflow_0_, 0 },
            { C::execution_sel_relative_overflow_1_, 0 },
            { C::execution_sel_relative_overflow_2_, 1 },
            { C::execution_sel_relative_overflow_3_, 1 },
            { C::execution_sel_relative_overflow_4_, 0 },
            { C::execution_sel_relative_overflow_5_, 0 },
            { C::execution_sel_relative_overflow_6_, 0 },
            // The are all expected to be 0 because the base address is invalid.
            { C::execution_sel_should_apply_indirection_0_, 0 },
            { C::execution_sel_should_apply_indirection_1_, 0 },
            { C::execution_sel_should_apply_indirection_2_, 0 },
            { C::execution_sel_should_apply_indirection_3_, 0 },
            { C::execution_sel_should_apply_indirection_4_, 0 },
            { C::execution_sel_should_apply_indirection_5_, 0 },
            { C::execution_sel_should_apply_indirection_6_, 0 },
        },
    });

    check_relation<addressing>(trace,
                               addressing::SR_INDIRECT_GATING_0,
                               addressing::SR_INDIRECT_GATING_1,
                               addressing::SR_INDIRECT_GATING_2,
                               addressing::SR_INDIRECT_GATING_3,
                               addressing::SR_INDIRECT_GATING_4,
                               addressing::SR_INDIRECT_GATING_5,
                               addressing::SR_INDIRECT_GATING_6);

    // Expect failures if we switch bits.
    trace.set(0,
              { {
                  // Opposite of above.
                  { C::execution_sel_should_apply_indirection_0_, 1 },
                  { C::execution_sel_should_apply_indirection_1_, 1 },
                  { C::execution_sel_should_apply_indirection_2_, 1 },
                  { C::execution_sel_should_apply_indirection_3_, 1 },
                  { C::execution_sel_should_apply_indirection_4_, 1 },
                  { C::execution_sel_should_apply_indirection_5_, 1 },
                  { C::execution_sel_should_apply_indirection_6_, 1 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_0), "INDIRECT_GATING_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_1), "INDIRECT_GATING_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_2), "INDIRECT_GATING_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_3), "INDIRECT_GATING_3");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_4), "INDIRECT_GATING_4");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_5), "INDIRECT_GATING_5");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_GATING_6), "INDIRECT_GATING_6");
}

TEST(AddressingConstrainingTest, IndirectPropagationWhenNoIndirection)
{
    // Note: The subrelations under test do NOT constrain the result of memory reads.
    // They only constrain that non-indirect operands are propagated from the previous step.
    TestTraceContainer trace({
        {
            { C::execution_sel_should_apply_indirection_0_, 0 },
            { C::execution_sel_should_apply_indirection_1_, 1 },
            { C::execution_sel_should_apply_indirection_2_, 0 },
            { C::execution_sel_should_apply_indirection_3_, 1 },
            { C::execution_sel_should_apply_indirection_4_, 0 },
            { C::execution_sel_should_apply_indirection_5_, 1 },
            { C::execution_sel_should_apply_indirection_6_, 0 },
            // From relative step.
            { C::execution_op_after_relative_0_, 123 },
            { C::execution_op_after_relative_1_, 456 },
            { C::execution_op_after_relative_2_, 789 },
            { C::execution_op_after_relative_3_, 101112 },
            { C::execution_op_after_relative_4_, 131415 },
            { C::execution_op_after_relative_5_, 161718 },
            { C::execution_op_after_relative_6_, 192021 },
            // After memory load (or nothing).
            { C::execution_rop_0_, 123 },
            { C::execution_rop_1_, 99001 }, // from mem
            { C::execution_rop_2_, 789 },
            { C::execution_rop_3_, 99002 }, // from mem
            { C::execution_rop_4_, 131415 },
            { C::execution_rop_5_, 99003 }, // from mem
            { C::execution_rop_6_, 192021 },
            // Selectors that enable the subrelation.
            // These set pol SEL_SHOULD_RESOLVE_ADDRESS.
            { C::execution_sel_bytecode_retrieval_success, 1 },
            { C::execution_sel_instruction_fetching_success, 1 },
        },
    });

    check_relation<addressing>(trace,
                               addressing::SR_INDIRECT_PROPAGATION_0,
                               addressing::SR_INDIRECT_PROPAGATION_1,
                               addressing::SR_INDIRECT_PROPAGATION_2,
                               addressing::SR_INDIRECT_PROPAGATION_3,
                               addressing::SR_INDIRECT_PROPAGATION_4,
                               addressing::SR_INDIRECT_PROPAGATION_5,
                               addressing::SR_INDIRECT_PROPAGATION_6);

    // These subrelations do not pay attention to SEL_SHOULD_RESOLVE_ADDRESS.
    trace.set(C::execution_sel_bytecode_retrieval_success, /*row=*/0, /*value=*/0);
    trace.set(C::execution_sel_instruction_fetching_success, /*row=*/0, /*value=*/0);
    check_relation<addressing>(trace,
                               addressing::SR_INDIRECT_PROPAGATION_0,
                               addressing::SR_INDIRECT_PROPAGATION_1,
                               addressing::SR_INDIRECT_PROPAGATION_2,
                               addressing::SR_INDIRECT_PROPAGATION_3,
                               addressing::SR_INDIRECT_PROPAGATION_4,
                               addressing::SR_INDIRECT_PROPAGATION_5,
                               addressing::SR_INDIRECT_PROPAGATION_6);

    // Expect failures if we change values (only the non-indirect ones).
    trace.set(0,
              { {
                  { C::execution_rop_0_, 7 },
                  { C::execution_rop_2_, 7 },
                  { C::execution_rop_4_, 7 },
                  { C::execution_rop_6_, 7 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_PROPAGATION_0),
                              "INDIRECT_PROPAGATION_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_PROPAGATION_2),
                              "INDIRECT_PROPAGATION_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_PROPAGATION_4),
                              "INDIRECT_PROPAGATION_4");
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_INDIRECT_PROPAGATION_6),
                              "INDIRECT_PROPAGATION_6");
}

TEST(AddressingConstrainingTest, IndirectPropagationWhenIndirection)
{
    // TODO(fcarreiro): test memory interaction.
}

/**************************************************************************************************
 *  Final Guarantees
 **************************************************************************************************/

TEST(AddressingConstrainingTest, FinalCheckNoFailure)
{
    constexpr size_t NUM_OPERANDS = 7;
    FF should_apply_indirection[NUM_OPERANDS] = { 0, 0, 0, 1, 0, 1, 1 };
    MemoryTag rop_tag[NUM_OPERANDS] = { MemoryTag::FF, MemoryTag::U8,  MemoryTag::U16, MemoryTag::U32,
                                        MemoryTag::U1, MemoryTag::U32, MemoryTag::U32 };

    auto get_tag_diff_inv = [&]() {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff +=
                should_apply_indirection[i] * power_of_2 * (FF(static_cast<uint8_t>(rop_tag[i])) - FF(MEM_TAG_U32));
            power_of_2 *= 8; // 2^3
        }
        return batched_tags_diff != 0 ? batched_tags_diff.invert() : 0;
    };

    TestTraceContainer trace({
        {
            // From indirect resolution.
            { C::execution_sel_should_apply_indirection_0_, should_apply_indirection[0] },
            { C::execution_sel_should_apply_indirection_1_, should_apply_indirection[1] },
            { C::execution_sel_should_apply_indirection_2_, should_apply_indirection[2] },
            { C::execution_sel_should_apply_indirection_3_, should_apply_indirection[3] },
            { C::execution_sel_should_apply_indirection_4_, should_apply_indirection[4] },
            { C::execution_sel_should_apply_indirection_5_, should_apply_indirection[5] },
            { C::execution_sel_should_apply_indirection_6_, should_apply_indirection[6] },
            // From indirection.
            { C::execution_rop_tag_0_, static_cast<uint8_t>(rop_tag[0]) }, // shouldn't matter
            { C::execution_rop_tag_1_, static_cast<uint8_t>(rop_tag[1]) }, // shouldn't matter
            { C::execution_rop_tag_2_, static_cast<uint8_t>(rop_tag[2]) }, // shouldn't matter
            { C::execution_rop_tag_3_, static_cast<uint8_t>(rop_tag[3]) }, // NO FAIlURE
            { C::execution_rop_tag_4_, static_cast<uint8_t>(rop_tag[4]) }, // shouldn't matter
            { C::execution_rop_tag_5_, static_cast<uint8_t>(rop_tag[5]) }, // NO FAILURE
            { C::execution_rop_tag_6_, static_cast<uint8_t>(rop_tag[6]) }, // NO FAILURE

            // From final check.
            { C::execution_batched_tags_diff_inv, get_tag_diff_inv() },
            { C::execution_sel_some_final_check_failed, 0 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_some_final_check_failed, /*row=*/0, /*value=*/1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK),
                              "BATCHED_TAGS_DIFF_CHECK");
}

TEST(AddressingConstrainingTest, FinalCheckSingleFailure)
{
    constexpr size_t NUM_OPERANDS = 7;
    FF should_apply_indirection[NUM_OPERANDS] = { 0, 1, 0, 1, 0, 1, 1 };
    MemoryTag rop_tag[NUM_OPERANDS] = { MemoryTag::FF, MemoryTag::U8,  MemoryTag::U16, MemoryTag::U32,
                                        MemoryTag::U1, MemoryTag::U32, MemoryTag::U1 };

    auto get_tag_diff_inv = [&]() {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff +=
                should_apply_indirection[i] * power_of_2 * (FF(static_cast<uint8_t>(rop_tag[i])) - FF(MEM_TAG_U32));
            power_of_2 *= 8; // 2^3
        }
        return batched_tags_diff != 0 ? batched_tags_diff.invert() : 0;
    };

    TestTraceContainer trace({
        {
            // From indirect resolution.
            { C::execution_sel_should_apply_indirection_0_, should_apply_indirection[0] },
            { C::execution_sel_should_apply_indirection_1_, should_apply_indirection[1] },
            { C::execution_sel_should_apply_indirection_2_, should_apply_indirection[2] },
            { C::execution_sel_should_apply_indirection_3_, should_apply_indirection[3] },
            { C::execution_sel_should_apply_indirection_4_, should_apply_indirection[4] },
            { C::execution_sel_should_apply_indirection_5_, should_apply_indirection[5] },
            { C::execution_sel_should_apply_indirection_6_, should_apply_indirection[6] },
            // From indirection.
            { C::execution_rop_tag_0_, static_cast<uint8_t>(rop_tag[0]) }, // shouldn't matter, not address
            { C::execution_rop_tag_1_, static_cast<uint8_t>(rop_tag[1]) }, // shouldn't matter, not address
            { C::execution_rop_tag_2_, static_cast<uint8_t>(rop_tag[2]) }, // shouldn't matter, not indirect
            { C::execution_rop_tag_3_, static_cast<uint8_t>(rop_tag[3]) }, // NO FAIlURE
            { C::execution_rop_tag_4_, static_cast<uint8_t>(rop_tag[4]) }, // shouldn't matter, not indirect
            { C::execution_rop_tag_5_, static_cast<uint8_t>(rop_tag[5]) }, // shouldn't matter, not address
            { C::execution_rop_tag_6_, static_cast<uint8_t>(rop_tag[6]) }, // FAILURE

            // From final check.
            { C::execution_batched_tags_diff_inv, get_tag_diff_inv() },
            { C::execution_sel_some_final_check_failed, 1 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_some_final_check_failed, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK),
                              "BATCHED_TAGS_DIFF_CHECK");
    trace.set(C::execution_batched_tags_diff_inv, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK),
                              "BATCHED_TAGS_DIFF_CHECK");
}

TEST(AddressingConstrainingTest, FinalCheckMultipleFailures)
{
    constexpr size_t NUM_OPERANDS = 7;
    FF should_apply_indirection[NUM_OPERANDS] = { 0, 1, 0, 1, 0, 1, 1 };
    MemoryTag rop_tag[NUM_OPERANDS] = { MemoryTag::FF, MemoryTag::U8,  MemoryTag::U16, MemoryTag::U8,
                                        MemoryTag::U1, MemoryTag::U32, MemoryTag::U1 };

    auto get_tag_diff_inv = [&]() {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff +=
                should_apply_indirection[i] * power_of_2 * (FF(static_cast<uint8_t>(rop_tag[i])) - FF(MEM_TAG_U32));
            power_of_2 *= 8; // 2^3
        }
        return batched_tags_diff != 0 ? batched_tags_diff.invert() : 0;
    };

    TestTraceContainer trace({
        {
            // From indirect resolution.
            { C::execution_sel_should_apply_indirection_0_, should_apply_indirection[0] },
            { C::execution_sel_should_apply_indirection_1_, should_apply_indirection[1] },
            { C::execution_sel_should_apply_indirection_2_, should_apply_indirection[2] },
            { C::execution_sel_should_apply_indirection_3_, should_apply_indirection[3] },
            { C::execution_sel_should_apply_indirection_4_, should_apply_indirection[4] },
            { C::execution_sel_should_apply_indirection_5_, should_apply_indirection[5] },
            { C::execution_sel_should_apply_indirection_6_, should_apply_indirection[6] },
            // From indirection.
            { C::execution_rop_tag_0_, static_cast<uint8_t>(rop_tag[0]) }, // shouldn't matter, not address
            { C::execution_rop_tag_1_, static_cast<uint8_t>(rop_tag[1]) }, // shouldn't matter, not address
            { C::execution_rop_tag_2_, static_cast<uint8_t>(rop_tag[2]) }, // shouldn't matter, not indirect
            { C::execution_rop_tag_3_, static_cast<uint8_t>(rop_tag[3]) }, // FAIlURE
            { C::execution_rop_tag_4_, static_cast<uint8_t>(rop_tag[4]) }, // shouldn't matter, not indirect
            { C::execution_rop_tag_5_, static_cast<uint8_t>(rop_tag[5]) }, // shouldn't matter, not address
            { C::execution_rop_tag_6_, static_cast<uint8_t>(rop_tag[6]) }, // FAILURE

            // From final check.
            { C::execution_batched_tags_diff_inv, get_tag_diff_inv() },
            { C::execution_sel_some_final_check_failed, 1 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK);

    // Should fail if I try to trick the selector.
    trace.set(C::execution_sel_some_final_check_failed, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK),
                              "BATCHED_TAGS_DIFF_CHECK");
    trace.set(C::execution_batched_tags_diff_inv, /*row=*/0, /*value=*/0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_BATCHED_TAGS_DIFF_CHECK),
                              "BATCHED_TAGS_DIFF_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
