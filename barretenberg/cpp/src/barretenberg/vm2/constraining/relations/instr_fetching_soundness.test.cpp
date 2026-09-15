/**
 * @file instr_fetching_soundness.test.cpp
 * @brief Tests demonstrating soundness vulnerability in sel_parsing_err constraint.
 *
 * VULNERABILITY: In instr_fetching.pil (line 83), the constraint that should enforce
 * `sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range + tag_out_of_range`
 * is COMMENTED OUT. This allows a malicious prover to set sel_parsing_err = 0 even when
 * actual parsing errors occur.
 *
 * FIX: Uncomment line 83 in barretenberg/cpp/pil/vm2/bytecode/instr_fetching.pil:
 *   sel_parsing_err = PARSING_ERROR_EXCEPT_TAG_ERROR + tag_out_of_range;
 *
 * These tests demonstrate the vulnerability:
 * - Tests prefixed with "SoundnessBug_" currently PASS but SHOULD FAIL once the constraint is enabled
 */

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/instr_fetching.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using instr_fetching = instr_fetching<FF>;

/**
 * SOUNDNESS BUG TEST: Error flag is set but sel_parsing_err is 0
 *
 * This test demonstrates that the constraint enforcing sel_parsing_err = sum of error flags
 * is COMMENTED OUT in instr_fetching.pil (line 83).
 *
 * We create a trace where pc_out_of_range = 1 but sel_parsing_err = 0.
 *
 * EXPECTED BEHAVIOR (once fixed): This should FAIL because sel_parsing_err should be 1
 * CURRENT BEHAVIOR (bug): This PASSES because the constraint is commented out
 */
TEST(InstrFetchingSoundnessTest, SoundnessBug_ErrorFlagSetButSelParsingErrIsZero)
{
    // Create a minimal trace that satisfies all constraints EXCEPT the (commented out) one
    // that should enforce sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range +
    // tag_out_of_range
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::instr_fetching_sel, 1 },
            // Error flags - pc_out_of_range is SET to 1
            { C::instr_fetching_pc_out_of_range, 1 },
            { C::instr_fetching_opcode_out_of_range, 0 },
            { C::instr_fetching_instr_out_of_range, 0 },
            { C::instr_fetching_tag_out_of_range, 0 },
            // THE BUG: sel_parsing_err should be 1 (since pc_out_of_range = 1) but we set it to 0
            // This should fail if the constraint was enabled, but passes because it's commented out
            { C::instr_fetching_sel_parsing_err, 0 },
            // Values to satisfy PC_OUT_OF_RANGE_TOGGLE constraint (subrelation 4):
            // pc_abs_diff = sel * ((2 * pc_out_of_range - 1) * (pc - bytecode_size) - 1 + pc_out_of_range)
            // With pc_out_of_range = 1: pc_abs_diff = (2*1-1) * (pc - bytecode_size) - 1 + 1 = pc - bytecode_size
            { C::instr_fetching_bytecode_size, 10 },
            { C::instr_fetching_pc, 15 },              // pc > bytecode_size
            { C::instr_fetching_pc_abs_diff, 5 },      // pc - bytecode_size = 15 - 10 = 5
            { C::instr_fetching_pc_size_in_bits, 32 }, // AVM_PC_SIZE_IN_BITS constant
            // Values to satisfy INSTR_OUT_OF_RANGE_TOGGLE constraint (subrelation 6):
            // instr_abs_diff = (2 * instr_out_of_range - 1) * (instr_size - bytes_to_read) - instr_out_of_range
            // With instr_out_of_range = 0: instr_abs_diff = (-1) * (instr_size - bytes_to_read) = bytes_to_read -
            // instr_size
            { C::instr_fetching_bytes_to_read, 10 },
            { C::instr_fetching_instr_size, 5 },
            { C::instr_fetching_instr_abs_diff, 5 }, // bytes_to_read - instr_size = 10 - 5 = 5
        },
    });

    // This test currently PASSES due to the missing constraint.
    // Once the constraint is uncommented in instr_fetching.pil, this test will correctly FAIL.
    //
    // To verify the bug exists, run this test - it should PASS.
    // Then uncomment line 83 in instr_fetching.pil, regenerate the relations, and run again - it should FAIL.
    check_relation<instr_fetching>(trace);
}

/**
 * POSITIVE TEST: Verify correct behavior when sel_parsing_err matches errors
 *
 * This test verifies that when sel_parsing_err is correctly set to 1 when errors occur,
 * the relation passes. This should continue to pass after the fix.
 */
TEST(InstrFetchingSoundnessTest, CorrectBehavior_SelParsingErrMatchesErrors)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::instr_fetching_sel, 1 },
            { C::instr_fetching_pc_out_of_range, 1 },
            { C::instr_fetching_opcode_out_of_range, 0 },
            { C::instr_fetching_instr_out_of_range, 0 },
            { C::instr_fetching_tag_out_of_range, 0 },
            { C::instr_fetching_sel_parsing_err, 1 }, // Correctly set to 1
            // Supporting values
            { C::instr_fetching_bytecode_size, 10 },
            { C::instr_fetching_pc, 15 },
            { C::instr_fetching_pc_abs_diff, 5 },
            { C::instr_fetching_pc_size_in_bits, 32 },
            { C::instr_fetching_bytes_to_read, 10 },
            { C::instr_fetching_instr_size, 5 },
            { C::instr_fetching_instr_abs_diff, 5 }, // bytes_to_read - instr_size = 10 - 5 = 5
        },
    });

    // This should pass both before and after the fix.
    check_relation<instr_fetching>(trace);
}

/**
 * POSITIVE TEST: No errors means sel_parsing_err should be 0
 */
TEST(InstrFetchingSoundnessTest, CorrectBehavior_NoErrorsMeansSelParsingErrIsZero)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::instr_fetching_sel, 1 },
            { C::instr_fetching_pc_out_of_range, 0 },
            { C::instr_fetching_opcode_out_of_range, 0 },
            { C::instr_fetching_instr_out_of_range, 0 },
            { C::instr_fetching_tag_out_of_range, 0 },
            { C::instr_fetching_sel_parsing_err, 0 }, // Correctly set to 0
            { C::instr_fetching_sel_pc_in_range, 1 }, // sel * (1 - pc_out_of_range) = 1 * 1 = 1
            // pc_abs_diff = sel * ((2 * pc_out_of_range - 1) * (pc - bytecode_size) - 1 + pc_out_of_range)
            // With pc_out_of_range = 0: pc_abs_diff = (2*0-1) * (pc - bytecode_size) - 1 + 0
            //                         = -(pc - bytecode_size) - 1 = bytecode_size - pc - 1
            { C::instr_fetching_bytecode_size, 20 },
            { C::instr_fetching_pc, 5 },
            { C::instr_fetching_pc_abs_diff, 14 }, // bytecode_size - pc - 1 = 20 - 5 - 1 = 14
            { C::instr_fetching_pc_size_in_bits, 32 },
            // instr_abs_diff = bytes_to_read - instr_size (when instr_out_of_range = 0)
            { C::instr_fetching_bytes_to_read, 15 },
            { C::instr_fetching_instr_size, 10 },
            { C::instr_fetching_instr_abs_diff, 5 }, // bytes_to_read - instr_size = 15 - 10 = 5
        },
    });

    // This should pass both before and after the fix.
    check_relation<instr_fetching>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
