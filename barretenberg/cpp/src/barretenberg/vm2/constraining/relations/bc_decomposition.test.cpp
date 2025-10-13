#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bc_decomposition.hpp"
#include "barretenberg/vm2/generated/relations/perms_bc_hashing.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/multi_permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using testing::random_bytes;
using tracegen::BytecodeTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_decomposition = bb::avm2::bc_decomposition<FF>;

void init_trace(TestTraceContainer& trace)
{
    // Add first row.
    trace.set(C::precomputed_first_row, 0, 1);
}

void set_perm_selectors(TestTraceContainer& trace)
{
    // These are normally set by the MultiPermutationBuilder e.g.:
    // MultiPermutationBuilder<perm_bc_hashing_get_packed_field_0_settings,
    //                         perm_bc_hashing_get_packed_field_1_settings,
    //                         perm_bc_hashing_get_packed_field_2_settings>
    //     perm_builder(C::bc_decomposition_sel_packed);
    // perm_builder.process(trace);
    // ...But since we are only testing decomp (without hashing) in some cases, this helper sets the selectors so we
    // don't fail:
    constexpr std::array<C, 3> selectors = { C::bc_decomposition_sel_packed_read_0_,
                                             C::bc_decomposition_sel_packed_read_1_,
                                             C::bc_decomposition_sel_packed_read_2_ };
    for (uint32_t r = 0; r < trace.get_num_rows();) {
        uint32_t bytes_remaining = static_cast<uint32_t>(trace.get(C::bc_decomposition_bytes_remaining, r));
        for (uint32_t i = r; i < r + bytes_remaining; i += 31) {
            // Cycle through the permutation selectors for each packed_field:
            trace.set(i, { { { selectors[((i - r) % 31) % 3], 1 } } });
        }
        r += bytes_remaining > 0 ? bytes_remaining : 1;
    }
}

TEST(BytecodeDecompositionConstrainingTest, EmptyRow)
{
    check_relation<bc_decomposition>(testing::empty_trace());
}

TEST(BytecodeDecompositionConstrainingTest, SingleBytecode)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) } }, trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 40);

    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    set_perm_selectors(trace);

    check_relation<bc_decomposition>(trace);
    check_interaction<BytecodeTraceBuilder, lookup_bc_decomposition_bytes_are_bytes_settings>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, ShortSingleBytecode)
{
    // Bytecode is shorter than the sliding window.
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(5)) } }, trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 5);

    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    set_perm_selectors(trace);

    check_relation<bc_decomposition>(trace);
    check_interaction<BytecodeTraceBuilder, lookup_bc_decomposition_bytes_are_bytes_settings>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, MultipleBytecodes)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) },
          { .bytecode_id = 2, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(55)) } },
        trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 40 + 55);

    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    set_perm_selectors(trace);

    check_relation<bc_decomposition>(trace);
    check_interaction<BytecodeTraceBuilder, lookup_bc_decomposition_bytes_are_bytes_settings>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, MultipleBytecodesWithShortOnes)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) },
          { .bytecode_id = 2, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(5)) },
          { .bytecode_id = 3, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(10)) },
          { .bytecode_id = 4, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(55)) },
          { .bytecode_id = 5, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(2)) } },
        trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 40 + 5 + 10 + 55 + 2);

    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    set_perm_selectors(trace);

    check_relation<bc_decomposition>(trace);
    check_interaction<BytecodeTraceBuilder, lookup_bc_decomposition_bytes_are_bytes_settings>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, NegativeDeactivatedSel)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_bytes_rem_inv, FF(33).invert() },
            { C::bc_decomposition_bytes_remaining, 33 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_bytes_rem_inv, FF(32).invert() },
            { C::bc_decomposition_bytes_remaining, 32 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_bytes_rem_inv, FF(31).invert() },
            { C::bc_decomposition_bytes_remaining, 31 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_SEL_BYTES_REM_NON_ZERO);
    trace.set(C::bc_decomposition_sel, 2, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_SEL_BYTES_REM_NON_ZERO),
        "BC_DEC_SEL_BYTES_REM_NON_ZERO");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeDeactivateLastContract)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_bytes_rem_min_one_inv, FF(2).invert() },
            { C::bc_decomposition_bytes_remaining, 3 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_bytes_rem_min_one_inv, 1 },
            { C::bc_decomposition_bytes_remaining, 2 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_bytes_rem_min_one_inv, 0 },
            { C::bc_decomposition_last_of_contract, 1 },
            { C::bc_decomposition_bytes_remaining, 1 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_LAST_CONTRACT_BYTES_REM_ONE);
    trace.set(C::bc_decomposition_last_of_contract, 2, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_LAST_CONTRACT_BYTES_REM_ONE),
        "BC_DEC_LAST_CONTRACT_BYTES_REM_ONE");
}

TEST(BytecodeDecompositionConstrainingTest, NegativePcWrongInitializationFirstRow)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::bc_decomposition_pc, 0 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION);
    trace.set(C::bc_decomposition_pc, 1, 7); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION),
        "BC_DEC_PC_ZERO_INITIALIZATION");
}

TEST(BytecodeDecompositionConstrainingTest, NegativePcWrongInitializationInside)
{
    TestTraceContainer trace({
        { { C::bc_decomposition_last_of_contract, 1 } },
        {
            { C::bc_decomposition_pc, 0 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION);
    trace.set(C::bc_decomposition_pc, 1, 32); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION),
        "BC_DEC_PC_ZERO_INITIALIZATION");
}

TEST(BytecodeDecompositionConstrainingTest, NegativePcWrongIncrement)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_pc, 5 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_pc, 6 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_last_of_contract, 1 }, // Required otherwise the test passes trivially
            { C::bc_decomposition_pc, 7 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_INCREMENT);
    trace.set(C::bc_decomposition_pc, 2, 6); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_INCREMENT),
                              "BC_DEC_PC_INCREMENT");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeBytesRemWrongDecrement)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_bytes_remaining, 5 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_bytes_remaining, 4 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_last_of_contract, 1 }, // Required otherwise the test passes trivially
            { C::bc_decomposition_bytes_remaining, 3 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_BYTES_REMAINING_DECREMENT);
    trace.set(C::bc_decomposition_bytes_remaining, 0, 4); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_BYTES_REMAINING_DECREMENT),
        "BC_DEC_BYTES_REMAINING_DECREMENT");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeMutateBytecodeId)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_id, 147 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_id, 147 },
            { C::bc_decomposition_sel, 1 },
        },
        {
            { C::bc_decomposition_last_of_contract, 1 }, // Required otherwise the test passes trivially
            { C::bc_decomposition_id, 147 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_ID_CONSTANT);
    trace.set(C::bc_decomposition_id, 2, 77); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_ID_CONSTANT),
                              "BC_DEC_ID_CONSTANT");
}

// Both positive and negative tests for sel_windows_gt_remaining initialization
TEST(BytecodeDecompositionConstrainingTest, SelWindowsGtRemainingInitialization)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_last_of_contract, 1 },
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_INIT);

    trace.set(C::bc_decomposition_sel_windows_gt_remaining, 0, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_INIT),
        "SEL_WINDOWS_GT_REMAINING_INIT");
}

// Both positive and negative tests for sel_windows_gt_remaining propagation without mutation.
TEST(BytecodeDecompositionConstrainingTest, SelWindowsGtRemainingPropagation)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 1 },
        },
        {
            { C::bc_decomposition_last_of_contract, 1 },
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_PROPAGATION);

    trace.set(C::bc_decomposition_sel_windows_gt_remaining, 0, 0); // Mutate to wrong value at the top
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_PROPAGATION),
        "SEL_WINDOWS_GT_REMAINING_PROPAGATION");

    // Reset to correct value
    trace.set(C::bc_decomposition_sel_windows_gt_remaining, 0, 1);

    trace.set(C::bc_decomposition_sel_windows_gt_remaining, 1, 0); // Mutate to wrong value at the bottom
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_PROPAGATION),
        "SEL_WINDOWS_GT_REMAINING_PROPAGATION");

    // Test propagattion of 0 instead of 1
    trace.set(C::bc_decomposition_sel_windows_gt_remaining, 0, 0); // Mutate to correct value
    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_PROPAGATION);
}

// Both positive and negative tests for sel_windows_gt_remaining propagation with mutation.
TEST(BytecodeDecompositionConstrainingTest, SelWindowsGtRemainingPropagationWithMutation)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_is_windows_eq_remaining, 1 },
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 0 },
        },
        {
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 1 },
        },
        {
            { C::bc_decomposition_last_of_contract, 1 },
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_PROPAGATION);

    trace.set(C::bc_decomposition_sel_windows_gt_remaining, 0, 1); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_WINDOWS_GT_REMAINING_PROPAGATION),
        "SEL_WINDOWS_GT_REMAINING_PROPAGATION");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeWrongBytesToReadNoCorrection)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE },
            { C::bc_decomposition_bytes_remaining, 75 },
            { C::bc_decomposition_sel, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SET_BYTES_TO_READ);
    trace.set(C::bc_decomposition_bytes_to_read, 0, 75); // Mutate to wrong value (bytes_remaining)
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_SET_BYTES_TO_READ),
                              "SET_BYTES_TO_READ");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeWrongBytesToReadWithCorrection)
{
    TestTraceContainer trace({
        {
            { C::bc_decomposition_bytes_to_read, 13 },
            { C::bc_decomposition_bytes_remaining, 13 },
            { C::bc_decomposition_sel, 1 },
            { C::bc_decomposition_sel_windows_gt_remaining, 1 },
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SET_BYTES_TO_READ);
    trace.set(C::bc_decomposition_bytes_to_read, 0, DECOMPOSE_WINDOW_SIZE); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_SET_BYTES_TO_READ),
                              "SET_BYTES_TO_READ");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeWrongPacking)
{
    TestTraceContainer trace;
    trace.set(0,
              { {
                  { C::bc_decomposition_sel_packed, 1 },
                  { C::bc_decomposition_bytes, 0x12 },
                  { C::bc_decomposition_bytes_pc_plus_1, 0x34 },
                  { C::bc_decomposition_bytes_pc_plus_2, 0x56 },
                  { C::bc_decomposition_bytes_pc_plus_3, 0x78 },
                  { C::bc_decomposition_bytes_pc_plus_4, 0x9A },
                  { C::bc_decomposition_bytes_pc_plus_5, 0xBC },
                  { C::bc_decomposition_bytes_pc_plus_6, 0xDE },
                  { C::bc_decomposition_bytes_pc_plus_7, 0xF0 },
                  { C::bc_decomposition_bytes_pc_plus_8, 0x12 },
                  { C::bc_decomposition_bytes_pc_plus_9, 0x34 },
                  { C::bc_decomposition_bytes_pc_plus_10, 0x56 },
                  { C::bc_decomposition_bytes_pc_plus_11, 0x78 },
                  { C::bc_decomposition_bytes_pc_plus_12, 0x9A },
                  { C::bc_decomposition_bytes_pc_plus_13, 0xBC },
                  { C::bc_decomposition_bytes_pc_plus_14, 0xDE },
                  { C::bc_decomposition_bytes_pc_plus_15, 0xF0 },
                  { C::bc_decomposition_bytes_pc_plus_16, 0x12 },
                  { C::bc_decomposition_bytes_pc_plus_17, 0x34 },
                  { C::bc_decomposition_bytes_pc_plus_18, 0x56 },
                  { C::bc_decomposition_bytes_pc_plus_19, 0x78 },
                  { C::bc_decomposition_bytes_pc_plus_20, 0x9A },
                  { C::bc_decomposition_bytes_pc_plus_21, 0xBC },
                  { C::bc_decomposition_bytes_pc_plus_22, 0xDE },
                  { C::bc_decomposition_bytes_pc_plus_23, 0xF0 },
                  { C::bc_decomposition_bytes_pc_plus_24, 0x12 },
                  { C::bc_decomposition_bytes_pc_plus_25, 0x34 },
                  { C::bc_decomposition_bytes_pc_plus_26, 0x56 },
                  { C::bc_decomposition_bytes_pc_plus_27, 0x78 },
                  { C::bc_decomposition_bytes_pc_plus_28, 0x9A },
                  { C::bc_decomposition_bytes_pc_plus_29, 0xBC },
                  { C::bc_decomposition_bytes_pc_plus_30, 0xDE },
                  { C::bc_decomposition_packed_field,
                    // Note that we have to prepend 0x00 to the packed field to make it 32 bytes long
                    // since the constructor for FF expects 32 bytes.
                    FF("0x00123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDE") },
              } });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DECOMPOSITION_REPACKING);
    trace.set(C::bc_decomposition_bytes_pc_plus_20, 0, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DECOMPOSITION_REPACKING),
                              "BC_DECOMPOSITION_REPACKING");
}

// Negative test where sel_packed == 1 and sel == 0
TEST(BytecodeDecompositionConstrainingTest, NegativeSelPackedNotSel)
{
    TestTraceContainer trace;
    trace.set(0,
              { {
                  { C::bc_decomposition_sel_packed, 1 },
                  { C::bc_decomposition_sel, 1 },
              } });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_TOGGLED_AT_PACKED);
    trace.set(C::bc_decomposition_sel, 0, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_TOGGLED_AT_PACKED),
                              "SEL_TOGGLED_AT_PACKED");
}

// Negative test where sel_packed == 0 at pc = 0
TEST(BytecodeDecompositionConstrainingTest, NegativeSelPackedInit)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(10)) } }, trace);
    set_perm_selectors(trace);
    check_relation<bc_decomposition>(trace);

    // First bytecode row should be packed:
    trace.set(C::bc_decomposition_sel_packed, 1, 0); // Mutate to wrong value
    trace.set(C::bc_decomposition_sel_packed_read_0_, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_SEL_PACKED_INIT),
                              "SEL_PACKED_INIT");
}

// Negative test where sel_packed == 0 at pc = 31
TEST(BytecodeDecompositionConstrainingTest, NegativeSelNotPacked)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) } }, trace);
    set_perm_selectors(trace);
    check_relation<bc_decomposition>(trace);

    // At row 32, pc = 31 and should be packed:
    ASSERT_EQ(trace.get(C::bc_decomposition_pc, 32), 31);
    trace.set(C::bc_decomposition_sel_packed, 32, 0); // Mutate to wrong value
    trace.set(C::bc_decomposition_sel_packed_read_1_, 32, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_PC_IS_PACKED),
                              "PC_IS_PACKED");
}

// Negative test where sel_packed == 1 at incorrect pc:
TEST(BytecodeDecompositionConstrainingTest, NegativeSelPacked)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) } }, trace);
    set_perm_selectors(trace);
    check_relation<bc_decomposition>(trace);

    // Should only be packed every 31 bytes:
    trace.set(C::bc_decomposition_sel_packed, 20, 1); // Mutate to wrong value
    trace.set(C::bc_decomposition_sel_packed_read_0_, 20, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_PC_IS_PACKED),
                              "PC_IS_PACKED");
}

// Negative test where next_packed_pc is set incorrectly:
TEST(BytecodeDecompositionConstrainingTest, NegativePackedPc)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(20)) } }, trace);
    set_perm_selectors(trace);
    check_relation<bc_decomposition>(trace);

    // Try to claim that when pc = 10, we should have sel_packed = 1:
    ASSERT_EQ(trace.get(C::bc_decomposition_pc, 11), 10);
    trace.set(C::bc_decomposition_sel_packed, 11, 1); // Mutate to wrong value
    trace.set(C::bc_decomposition_sel_packed_read_0_, 11, 1);
    trace.set(C::bc_decomposition_next_packed_pc, 11, 10);
    trace.set(C::bc_decomposition_next_packed_pc_min_pc_inv, 11, 0);
    // Passes main relation...
    check_relation<bc_decomposition>(trace, bc_decomposition::SR_PC_IS_PACKED);
    // ...but fails propagation:
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_NEXT_PACKED_PC_PROPAGATION),
                              "NEXT_PACKED_PC_PROPAGATION failed at row 10");
    // We cannot set every row up to 11, because we force pc = 0 <==> sel_packed = 1, which then increments
    // next_packed_pc by 31:
    for (uint32_t i = 2; i < 11; i++) {
        trace.set(C::bc_decomposition_next_packed_pc, i, 10);
        trace.set(C::bc_decomposition_next_packed_pc_min_pc_inv, i, FF(10 - i + 1).invert());
    }
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_NEXT_PACKED_PC_PROPAGATION),
                              "NEXT_PACKED_PC_PROPAGATION failed at row 1");
}

} // namespace
} // namespace bb::avm2::constraining
