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

TEST(AddressingConstrainingTest, EmptyRow)
{
    check_relation<addressing>(testing::empty_trace());
}

// TODO(fcarreiro): add test from events.
// TEST(AddressingConstrainingTest, Basic)
// {
//     TestTraceContainer trace({
//         {
//             { C::precomputed_first_row, 1 },
//         },
//     });
//
//     check_relation<addressing>(trace);
// }

/**************************************************************************************************
 *  Base Address Resolution
 **************************************************************************************************/

TEST(AddressingConstrainingTest, BaseAddressGating)
{
    // If the are no relative operands, it's ok that sel_do_base_check is 0.
    TestTraceContainer trace({ {
        // If this is off the whole subrelation is unconstrained.
        { C::execution_sel_should_resolve_address, 1 },
    } });
    check_relation<addressing>(trace, addressing::SR_NUM_RELATIVE_INV_CHECK);

    trace.set(0,
              { {
                  { C::execution_sel_op_is_relative_0_, 1 },
                  { C::execution_sel_op_is_relative_1_, 0 },
                  { C::execution_sel_op_is_relative_2_, 1 },
                  { C::execution_sel_op_is_relative_3_, 0 },
                  { C::execution_sel_op_is_relative_4_, 1 },
                  { C::execution_sel_op_is_relative_5_, 0 },
                  { C::execution_sel_op_is_relative_6_, 0 },
                  { C::execution_sel_do_base_check, 0 }, // should be 1
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NUM_RELATIVE_INV_CHECK),
                              "NUM_RELATIVE_INV_CHECK");

    // Even if we fix the inverse, sel_do_base_check should still be 1 and not 0.
    trace.set(C::execution_num_relative_operands_inv, /*row=*/0, /*value=*/FF(3).invert());
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
            { C::execution_sel_should_resolve_address, 1 },
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
    FF base_address_tag_diff_inv = FF(base_address_tag - static_cast<uint8_t>(MemoryTag::U32)).invert();

    TestTraceContainer trace({
        {
            { C::execution_base_address_tag, base_address_tag },
            { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
            { C::execution_sel_base_address_failure, 1 },
            // Selectors that enable the subrelation.
            { C::execution_sel_should_resolve_address, 1 },
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
    FF base_address_tag_diff_inv = FF(base_address_tag - static_cast<uint8_t>(MemoryTag::U32)).invert();

    TestTraceContainer trace({
        {
            { C::execution_base_address_tag, base_address_tag },
            { C::execution_base_address_tag_diff_inv, base_address_tag_diff_inv },
            { C::execution_sel_base_address_failure, 0 },
            // Selectors that enable the subrelation.
            { C::execution_sel_should_resolve_address, 1 },
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
                  { C::execution_sel_should_resolve_address, 0 },
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
            // Selectors that enable the subrelation.
            { C::execution_sel_should_resolve_address, 1 },
            { C::execution_sel_op_is_relative_0_, 1 },
            { C::execution_sel_op_is_relative_1_, 0 },
            { C::execution_sel_op_is_relative_2_, 1 },
            { C::execution_sel_op_is_relative_3_, 0 },
            { C::execution_sel_op_is_relative_4_, 1 },
            { C::execution_sel_op_is_relative_5_, 0 },
            { C::execution_sel_op_is_relative_6_, 1 },
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

    // Propagation is unconstrained if sel_should_resolve_address is 0.
    trace.set(C::execution_sel_should_resolve_address, /*row=*/0, /*value=*/0);
    check_relation<addressing>(trace,
                               addressing::SR_RELATIVE_RESOLUTION_0,
                               addressing::SR_RELATIVE_RESOLUTION_1,
                               addressing::SR_RELATIVE_RESOLUTION_2,
                               addressing::SR_RELATIVE_RESOLUTION_3,
                               addressing::SR_RELATIVE_RESOLUTION_4,
                               addressing::SR_RELATIVE_RESOLUTION_5,
                               addressing::SR_RELATIVE_RESOLUTION_6);
}

TEST(AddressingConstrainingTest, RelativeOverflow)
{
    // TODO(fcarreiro): add tests for relative overflow once we have the error from the range check.
    // Pay particular attention to how sel_relative_overflow can be used (maliciously or not)
    // to disable indirect resolution.
}

/**************************************************************************************************
 *  Indirect Resolution
 **************************************************************************************************/

TEST(AddressingConstrainingTest, IndirectReconstruction)
{
    TestTraceContainer trace({
        {
            { C::execution_indirect, 0b11'00'01'00'01'11'01'01 },
            { C::execution_sel_op_is_indirect_0_, 1 },
            { C::execution_sel_op_is_relative_0_, 0 },
            { C::execution_sel_op_is_indirect_1_, 1 },
            { C::execution_sel_op_is_relative_1_, 0 },
            { C::execution_sel_op_is_indirect_2_, 1 },
            { C::execution_sel_op_is_relative_2_, 1 },
            { C::execution_sel_op_is_indirect_3_, 1 },
            { C::execution_sel_op_is_relative_3_, 0 },
            { C::execution_sel_op_is_indirect_4_, 0 },
            { C::execution_sel_op_is_relative_4_, 0 },
            { C::execution_sel_op_is_indirect_5_, 1 },
            { C::execution_sel_op_is_relative_5_, 0 },
            { C::execution_sel_op_is_indirect_6_, 0 },
            { C::execution_sel_op_is_relative_6_, 0 },
            { C::execution_sel_op_is_relative_7_, 1 },
            { C::execution_sel_op_is_indirect_7_, 1 },
            // Selectors that enable the subrelation.
            { C::execution_sel_should_resolve_address, 1 },
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
            { C::execution_sel_should_resolve_address, 0 },
        },
    });

    check_relation<addressing>(trace, addressing::SR_INDIRECT_RECONSTRUCTION);

    // If we set any to non-zero, the relation should fail.
    constexpr std::array<Column, 16> decomposition_columns = {
        C::execution_sel_op_is_indirect_0_, C::execution_sel_op_is_relative_0_, C::execution_sel_op_is_indirect_1_,
        C::execution_sel_op_is_relative_1_, C::execution_sel_op_is_indirect_2_, C::execution_sel_op_is_relative_2_,
        C::execution_sel_op_is_indirect_3_, C::execution_sel_op_is_relative_3_, C::execution_sel_op_is_indirect_4_,
        C::execution_sel_op_is_relative_4_, C::execution_sel_op_is_indirect_5_, C::execution_sel_op_is_relative_5_,
        C::execution_sel_op_is_indirect_6_, C::execution_sel_op_is_relative_6_, C::execution_sel_op_is_relative_7_,
        C::execution_sel_op_is_indirect_7_
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
            // From wire.
            { C::execution_sel_op_is_indirect_0_, 0 },
            { C::execution_sel_op_is_indirect_1_, 1 },
            { C::execution_sel_op_is_indirect_2_, 0 },
            { C::execution_sel_op_is_indirect_3_, 1 },
            { C::execution_sel_op_is_indirect_4_, 0 },
            { C::execution_sel_op_is_indirect_5_, 1 },
            { C::execution_sel_op_is_indirect_6_, 0 },
            // From relative step.
            { C::execution_sel_relative_overflow_0_, 0 },
            { C::execution_sel_relative_overflow_1_, 0 },
            { C::execution_sel_relative_overflow_2_, 1 },
            { C::execution_sel_relative_overflow_3_, 1 },
            { C::execution_sel_relative_overflow_4_, 0 },
            { C::execution_sel_relative_overflow_5_, 0 },
            { C::execution_sel_relative_overflow_6_, 1 },
            // Expected.
            { C::execution_sel_should_apply_indirection_0_, 0 }, // no indirect bit
            { C::execution_sel_should_apply_indirection_1_, 1 }, // indirect
            { C::execution_sel_should_apply_indirection_2_, 0 }, // no indirect and relative overflowed
            { C::execution_sel_should_apply_indirection_3_, 0 }, // indirect and relative overflowed
            { C::execution_sel_should_apply_indirection_4_, 0 }, // no indirect and no relative overflow
            { C::execution_sel_should_apply_indirection_5_, 1 }, // indirect and no relative overflow
            { C::execution_sel_should_apply_indirection_6_, 0 },
            // Selectors that enable the subrelation.
            { C::execution_sel_should_resolve_address, 1 },
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

    // Bits are still constrained if sel_should_resolve_address is 0.
    // This just simplifies the relation.
    trace.set(C::execution_sel_should_resolve_address, /*row=*/0, /*value=*/0);
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
            { C::execution_sel_should_resolve_address, 1 },
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

    // These subrelations do not pay attention to sel_should_resolve_address.
    trace.set(C::execution_sel_should_resolve_address, /*row=*/0, /*value=*/0);
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
    FF should_apply_indirection[NUM_OPERANDS] = { 0, 1, 0, 1, 0, 1, 1 };
    FF is_address[NUM_OPERANDS] = { 0, 0, 1, 1, 0, 0, 1 };
    MemoryTag rop_tag[NUM_OPERANDS] = { MemoryTag::FF, MemoryTag::U8,  MemoryTag::U16, MemoryTag::U32,
                                        MemoryTag::U1, MemoryTag::U32, MemoryTag::U32 };

    auto get_tag_diff_inv = [&]() {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff += is_address[i] * should_apply_indirection[i] * power_of_2 *
                                 (FF(static_cast<uint8_t>(rop_tag[i])) - FF(MEM_TAG_U32));
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
            // From spec.
            { C::execution_sel_op_is_address_0_, is_address[0] },
            { C::execution_sel_op_is_address_1_, is_address[1] },
            { C::execution_sel_op_is_address_2_, is_address[2] },
            { C::execution_sel_op_is_address_3_, is_address[3] },
            { C::execution_sel_op_is_address_4_, is_address[4] },
            { C::execution_sel_op_is_address_5_, is_address[5] },
            { C::execution_sel_op_is_address_6_, is_address[6] },
            // From indirection.
            { C::execution_rop_tag_0_, static_cast<uint8_t>(rop_tag[0]) }, // shouldn't matter, not address
            { C::execution_rop_tag_1_, static_cast<uint8_t>(rop_tag[1]) }, // shouldn't matter, not address
            { C::execution_rop_tag_2_, static_cast<uint8_t>(rop_tag[2]) }, // shouldn't matter, not indirect
            { C::execution_rop_tag_3_, static_cast<uint8_t>(rop_tag[3]) }, // NO FAIlURE
            { C::execution_rop_tag_4_, static_cast<uint8_t>(rop_tag[4]) }, // shouldn't matter, not indirect
            { C::execution_rop_tag_5_, static_cast<uint8_t>(rop_tag[5]) }, // shouldn't matter, not address
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
    FF is_address[NUM_OPERANDS] = { 0, 0, 1, 1, 0, 0, 1 };
    MemoryTag rop_tag[NUM_OPERANDS] = { MemoryTag::FF, MemoryTag::U8,  MemoryTag::U16, MemoryTag::U32,
                                        MemoryTag::U1, MemoryTag::U32, MemoryTag::U1 };

    auto get_tag_diff_inv = [&]() {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff += is_address[i] * should_apply_indirection[i] * power_of_2 *
                                 (FF(static_cast<uint8_t>(rop_tag[i])) - FF(MEM_TAG_U32));
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
            // From spec.
            { C::execution_sel_op_is_address_0_, is_address[0] },
            { C::execution_sel_op_is_address_1_, is_address[1] },
            { C::execution_sel_op_is_address_2_, is_address[2] },
            { C::execution_sel_op_is_address_3_, is_address[3] },
            { C::execution_sel_op_is_address_4_, is_address[4] },
            { C::execution_sel_op_is_address_5_, is_address[5] },
            { C::execution_sel_op_is_address_6_, is_address[6] },
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
    FF is_address[NUM_OPERANDS] = { 0, 0, 1, 1, 0, 0, 1 };
    MemoryTag rop_tag[NUM_OPERANDS] = { MemoryTag::FF, MemoryTag::U8,  MemoryTag::U16, MemoryTag::U8,
                                        MemoryTag::U1, MemoryTag::U32, MemoryTag::U1 };

    auto get_tag_diff_inv = [&]() {
        FF batched_tags_diff = 0;
        FF power_of_2 = 1;
        for (size_t i = 0; i < NUM_OPERANDS; ++i) {
            batched_tags_diff += is_address[i] * should_apply_indirection[i] * power_of_2 *
                                 (FF(static_cast<uint8_t>(rop_tag[i])) - FF(MEM_TAG_U32));
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
            // From spec.
            { C::execution_sel_op_is_address_0_, is_address[0] },
            { C::execution_sel_op_is_address_1_, is_address[1] },
            { C::execution_sel_op_is_address_2_, is_address[2] },
            { C::execution_sel_op_is_address_3_, is_address[3] },
            { C::execution_sel_op_is_address_4_, is_address[4] },
            { C::execution_sel_op_is_address_5_, is_address[5] },
            { C::execution_sel_op_is_address_6_, is_address[6] },
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
