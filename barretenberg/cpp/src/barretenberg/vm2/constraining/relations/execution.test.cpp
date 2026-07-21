#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/addressing.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/gas.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/generated/relations/registers.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;
using addressing = bb::avm2::addressing<FF>;
using gas = bb::avm2::gas<FF>;
using registers = bb::avm2::registers<FF>;

TEST(ExecutionConstrainingTest, EmptyRow)
{
    check_relation<execution>(testing::empty_trace());
}

// DO NOT SUBMIT: add full flow tests
// TEST(ExecutionConstrainingTest, Basic)
// {
//     // clang-format off
//     TestTraceContainer trace({
//          {{ C::execution_sel, 1 }, { C::execution_pc, 0 }},
//          {{ C::execution_sel, 1 }, { C::execution_pc, 20 }, { C::execution_last, 1 }}
//     });
//     // clang-format on

//     check_relation<execution>(trace);
// }

TEST(ExecutionConstrainingTest, Continuity)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::precomputed_first_row, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, { C::execution_enqueued_call_end, 1 }},
    });
    // clang-format on

    check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY);

    // Negative test: remove enqueued call end
    trace.set(C::execution_enqueued_call_end, 3, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY),
                              execution::get_subrelation_label(execution::SR_TRACE_CONTINUITY));
}

TEST(ExecutionConstrainingTest, ContinuityBrokenFirstRow)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 0 }},  // End of trace!
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, { C::execution_enqueued_call_end, 1 }},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY),
                              execution::get_subrelation_label(execution::SR_TRACE_CONTINUITY));
}

TEST(ExecutionConstrainingTest, ContinuityBrokenInMiddle)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 0 }},  // End of trace!
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, { C::execution_enqueued_call_end, 1 }},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY),
                              execution::get_subrelation_label(execution::SR_TRACE_CONTINUITY));
}

TEST(ExecutionConstrainingTest, TreeStateNotChanged)
{
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_prev_note_hash_tree_root, 10 },
            { C::execution_prev_note_hash_tree_size, 9 },
            { C::execution_prev_num_note_hashes_emitted, 8 },
            { C::execution_prev_nullifier_tree_root, 7 },
            { C::execution_prev_nullifier_tree_size, 6 },
            { C::execution_prev_num_nullifiers_emitted, 5 },
            { C::execution_prev_public_data_tree_root, 4 },
            { C::execution_prev_public_data_tree_size, 3 },
            { C::execution_prev_written_public_data_slots_tree_root, 2 },
            { C::execution_prev_written_public_data_slots_tree_size, 1 },
            { C::execution_prev_retrieved_bytecodes_tree_root, 12 },
            { C::execution_prev_retrieved_bytecodes_tree_size, 13 },
            { C::execution_note_hash_tree_root, 10 },
            { C::execution_note_hash_tree_size, 9 },
            { C::execution_num_note_hashes_emitted, 8 },
            { C::execution_nullifier_tree_root, 7 },
            { C::execution_nullifier_tree_size, 6 },
            { C::execution_num_nullifiers_emitted, 5 },
            { C::execution_public_data_tree_root, 4 },
            { C::execution_public_data_tree_size, 3 },
            { C::execution_written_public_data_slots_tree_root, 2 },
            { C::execution_written_public_data_slots_tree_size, 1 },
            { C::execution_retrieved_bytecodes_tree_root, 12 },
            { C::execution_retrieved_bytecodes_tree_size, 13 },
        },
    });

    check_relation<execution>(trace,
                              execution::SR_NOTE_HASH_TREE_ROOT_NOT_CHANGED,
                              execution::SR_NOTE_HASH_TREE_SIZE_NOT_CHANGED,
                              execution::SR_NUM_NOTE_HASHES_EMITTED_NOT_CHANGED,
                              execution::SR_NULLIFIER_TREE_ROOT_NOT_CHANGED,
                              execution::SR_NULLIFIER_TREE_SIZE_NOT_CHANGED,
                              execution::SR_NUM_NULLIFIERS_EMITTED_NOT_CHANGED,
                              execution::SR_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED,
                              execution::SR_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED,
                              execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_NOT_CHANGED,
                              execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_NOT_CHANGED,
                              execution::SR_RETRIEVED_BYTECODES_TREE_ROOT_NOT_CHANGED,
                              execution::SR_RETRIEVED_BYTECODES_TREE_SIZE_NOT_CHANGED);

    // Negative test: change note hash tree root
    trace.set(C::execution_note_hash_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NOTE_HASH_TREE_ROOT_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NOTE_HASH_TREE_ROOT_NOT_CHANGED));

    // Negative test: change note hash tree size
    trace.set(C::execution_note_hash_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NOTE_HASH_TREE_SIZE_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NOTE_HASH_TREE_SIZE_NOT_CHANGED));

    // Negative test: change num note hashes emitted
    trace.set(C::execution_num_note_hashes_emitted, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_NOTE_HASHES_EMITTED_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NUM_NOTE_HASHES_EMITTED_NOT_CHANGED));

    // Negative test: change nullifier tree root
    trace.set(C::execution_nullifier_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NULLIFIER_TREE_ROOT_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NULLIFIER_TREE_ROOT_NOT_CHANGED));

    // Negative test: change nullifier tree size
    trace.set(C::execution_nullifier_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NULLIFIER_TREE_SIZE_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NULLIFIER_TREE_SIZE_NOT_CHANGED));

    // Negative test: change num nullifiers emitted
    trace.set(C::execution_prev_num_nullifiers_emitted, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_NULLIFIERS_EMITTED_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NUM_NULLIFIERS_EMITTED_NOT_CHANGED));

    // Negative test: change public data tree root
    trace.set(C::execution_public_data_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED));

    // Negative test: change public data tree size
    trace.set(C::execution_public_data_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED));

    // Negative test: change written public data slots tree root
    trace.set(C::execution_written_public_data_slots_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<execution>(trace, execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_NOT_CHANGED),
        execution::get_subrelation_label(execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_NOT_CHANGED));

    // Negative test: change written public data slots tree size
    trace.set(C::execution_written_public_data_slots_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<execution>(trace, execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_NOT_CHANGED),
        execution::get_subrelation_label(execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_NOT_CHANGED));

    // Negative test: change retrieved bytecodes tree root
    trace.set(C::execution_retrieved_bytecodes_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<execution>(trace, execution::SR_RETRIEVED_BYTECODES_TREE_ROOT_NOT_CHANGED),
        execution::get_subrelation_label(execution::SR_RETRIEVED_BYTECODES_TREE_ROOT_NOT_CHANGED));

    // Negative test: change retrieved bytecodes tree size
    trace.set(C::execution_retrieved_bytecodes_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<execution>(trace, execution::SR_RETRIEVED_BYTECODES_TREE_SIZE_NOT_CHANGED),
        execution::get_subrelation_label(execution::SR_RETRIEVED_BYTECODES_TREE_SIZE_NOT_CHANGED));
}

TEST(ExecutionConstrainingTest, SideEffectStateNotChanged)
{
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_prev_num_public_log_fields, 10 },
            { C::execution_prev_num_l2_to_l1_messages, 11 },
            { C::execution_num_public_log_fields, 10 },
            { C::execution_num_l2_to_l1_messages, 11 },
        },
    });

    check_relation<execution>(
        trace, execution::SR_NUM_PUBLIC_LOGS_NOT_CHANGED, execution::SR_NUM_L2_TO_L1_MESSAGES_NOT_CHANGED);

    // Negative test: change num public logs
    trace.set(C::execution_num_public_log_fields, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_PUBLIC_LOGS_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NUM_PUBLIC_LOGS_NOT_CHANGED));

    // Negative test: change num l2 to l1 messages
    trace.set(C::execution_num_l2_to_l1_messages, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_L2_TO_L1_MESSAGES_NOT_CHANGED),
                              execution::get_subrelation_label(execution::SR_NUM_L2_TO_L1_MESSAGES_NOT_CHANGED));
}

TEST(ExecutionConstrainingTest, NoFetchingNoInstrFetchError)
{
    // sel_bytecode_retrieval_success == 0 => sel_instruction_fetching_failure == 0
    TestTraceContainer trace({
        { { C::execution_sel_bytecode_retrieval_success, 0 }, { C::execution_sel_instruction_fetching_failure, 0 } },
    });

    check_relation<execution>(trace, execution::SR_NO_FETCHING_NO_INSTR_FETCH_ERROR);

    // Negative test: sel_bytecode_retrieval_success == 0 but sel_instruction_fetching_failure == 1
    trace.set(C::execution_sel_instruction_fetching_failure, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NO_FETCHING_NO_INSTR_FETCH_ERROR),
                              execution::get_subrelation_label(execution::SR_NO_FETCHING_NO_INSTR_FETCH_ERROR));

    // Positive test: sel_bytecode_retrieval_success == 1 allows sel_instruction_fetching_failure == 1
    trace.set(C::execution_sel_bytecode_retrieval_success, 0, 1);
    check_relation<execution>(trace, execution::SR_NO_FETCHING_NO_INSTR_FETCH_ERROR);
}

TEST(ExecutionConstrainingTest, NoAddressingErrorIfNotResolving)
{
    // sel_instruction_fetching_success == 0 => sel_addressing_error == 0
    // (SEL_RESOLVE_ADDRESS is an alias for sel_instruction_fetching_success)
    TestTraceContainer trace({
        { { C::execution_sel_instruction_fetching_success, 0 }, { C::execution_sel_addressing_error, 0 } },
    });

    check_relation<addressing>(trace, addressing::SR_NO_ADDRESSING_ERROR_IF_NOT_RESOLVING);

    // Negative test: sel_instruction_fetching_success == 0 but sel_addressing_error == 1
    trace.set(C::execution_sel_addressing_error, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<addressing>(trace, addressing::SR_NO_ADDRESSING_ERROR_IF_NOT_RESOLVING),
                              addressing::get_subrelation_label(addressing::SR_NO_ADDRESSING_ERROR_IF_NOT_RESOLVING));

    // Positive test: sel_instruction_fetching_success == 1 allows sel_addressing_error == 1
    trace.set(C::execution_sel_instruction_fetching_success, 0, 1);
    check_relation<addressing>(trace, addressing::SR_NO_ADDRESSING_ERROR_IF_NOT_RESOLVING);
}

TEST(ExecutionConstrainingTest, NoRegisterReadErrorIfNotReading)
{
    // sel_read_registers == 0 => sel_register_read_error == 0
    // Via #[REGISTER_READ_TAG_CHECK]: when sel_read_registers == 0, BATCHED_TAGS_DIFF_X_REG == 0,
    // which forces sel_register_read_error == 0.
    TestTraceContainer trace({
        { { C::execution_sel_read_registers, 0 }, { C::execution_sel_register_read_error, 0 } },
    });

    check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK);

    // Negative test: sel_read_registers == 0 but sel_register_read_error == 1
    trace.set(C::execution_sel_register_read_error, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<registers>(trace, registers::SR_REGISTER_READ_TAG_CHECK),
                              registers::get_subrelation_label(registers::SR_REGISTER_READ_TAG_CHECK));
}

TEST(ExecutionConstrainingTest, NoOogIfNoGasCheck)
{
    // sel_check_gas == 0 => sel_out_of_gas == 0
    TestTraceContainer trace({
        { { C::execution_sel_check_gas, 0 }, { C::execution_sel_out_of_gas, 0 } },
    });

    check_relation<gas>(trace, gas::SR_NO_OOG_IF_NO_GAS_CHECK);

    // Negative test: sel_check_gas == 0 but sel_out_of_gas == 1
    trace.set(C::execution_sel_out_of_gas, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_NO_OOG_IF_NO_GAS_CHECK),
                              gas::get_subrelation_label(gas::SR_NO_OOG_IF_NO_GAS_CHECK));

    // Positive test: sel_check_gas == 1 allows sel_out_of_gas == 1
    trace.set(C::execution_sel_check_gas, 0, 1);
    check_relation<gas>(trace, gas::SR_NO_OOG_IF_NO_GAS_CHECK);
}

TEST(ExecutionConstrainingTest, NoOpcodeErrorIfNotExecuting)
{
    // sel_execute_opcode == 0 => sel_opcode_error == 0
    TestTraceContainer trace({
        { { C::execution_sel_execute_opcode, 0 }, { C::execution_sel_opcode_error, 0 } },
    });

    check_relation<execution>(trace, execution::SR_NO_OPCODE_ERROR_IF_NOT_EXECUTING);

    // Negative test: sel_execute_opcode == 0 but sel_opcode_error == 1
    trace.set(C::execution_sel_opcode_error, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NO_OPCODE_ERROR_IF_NOT_EXECUTING),
                              execution::get_subrelation_label(execution::SR_NO_OPCODE_ERROR_IF_NOT_EXECUTING));

    // Positive test: sel_execute_opcode == 1 allows sel_opcode_error == 1
    trace.set(C::execution_sel_execute_opcode, 0, 1);
    check_relation<execution>(trace, execution::SR_NO_OPCODE_ERROR_IF_NOT_EXECUTING);
}

TEST(ExecutionConstrainingTest, SubtraceIdDecomposition)
{
    using tracegen::get_subtrace_id;
    using tracegen::get_subtrace_selector;
    using tracegen::SubtraceSel;

    TestTraceContainer trace;
    const uint8_t enum_length = static_cast<uint8_t>(SubtraceSel::MAX) + 1;

    for (uint8_t i = 0; i < enum_length; i++) {
        SubtraceSel subtrace_sel = static_cast<SubtraceSel>(i);
        const auto subtrace_id = get_subtrace_id(subtrace_sel);
        const auto subtrace_selector = get_subtrace_selector(subtrace_sel);

        trace.set(i,
                  { {
                      { subtrace_selector, 1 },
                      { C::execution_subtrace_id, subtrace_id },
                      { C::execution_sel_execute_opcode, 1 },
                  } });
    }

    check_relation<execution>(trace, execution::SR_SUBTRACE_ID_DECOMPOSITION);

    for (uint8_t i = 0; i < enum_length; i++) {
        const auto subtrace_selector = get_subtrace_selector(static_cast<SubtraceSel>(i));

        // Negative test: de-activate the selector
        trace.set(subtrace_selector, i, 0);
        EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SUBTRACE_ID_DECOMPOSITION),
                                  execution::get_subrelation_label(execution::SR_SUBTRACE_ID_DECOMPOSITION));

        // Negative test: activate the wrong selector
        const auto wrong_selector = get_subtrace_selector(static_cast<SubtraceSel>((i + 1) % enum_length));
        trace.set(wrong_selector, i, 1);
        EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SUBTRACE_ID_DECOMPOSITION),
                                  execution::get_subrelation_label(execution::SR_SUBTRACE_ID_DECOMPOSITION));
        // De-activate the wrong selector
        trace.set(wrong_selector, i, 0);

        // Re-activate the correct selector
        trace.set(subtrace_selector, i, 1);

        // Ensure we have a correct trace for the next iteration
        check_relation<execution>(trace, execution::SR_SUBTRACE_ID_DECOMPOSITION);
    }
}

} // namespace
} // namespace bb::avm2::constraining
