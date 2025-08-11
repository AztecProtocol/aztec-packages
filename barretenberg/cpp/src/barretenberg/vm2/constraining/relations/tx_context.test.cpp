#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/tx_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using tracegen::TxTraceBuilder;
using FF = AvmFlavorSettings::FF;
using C = Column;
using tx = bb::avm2::tx<FF>;
using tx_context = bb::avm2::tx_context<FF>;

TEST(TxContextConstrainingTest, Continuity)
{
    TestTraceContainer trace({
        {
            // Row 0: end of setup
            { C::tx_sel, 1 },
            { C::tx_reverted, 0 },
            { C::tx_next_note_hash_tree_root, 1 },
            { C::tx_next_note_hash_tree_size, 2 },
            { C::tx_next_num_note_hashes_emitted, 3 },
            { C::tx_next_nullifier_tree_root, 4 },
            { C::tx_next_nullifier_tree_size, 5 },
            { C::tx_next_num_nullifiers_emitted, 6 },
            { C::tx_next_public_data_tree_root, 7 },
            { C::tx_next_public_data_tree_size, 8 },
            { C::tx_next_written_public_data_slots_tree_root, 9 },
            { C::tx_next_written_public_data_slots_tree_size, 10 },
            { C::tx_l1_l2_tree_root, 11 },
            { C::tx_next_num_unencrypted_logs, 12 },
            { C::tx_next_num_l2_to_l1_messages, 13 },
        },
        {
            // Row 1: app logic, reverts
            { C::tx_sel, 1 },
            { C::tx_reverted, 1 },
            { C::tx_prev_note_hash_tree_root, 1 },
            { C::tx_prev_note_hash_tree_size, 2 },
            { C::tx_prev_num_note_hashes_emitted, 3 },
            { C::tx_prev_nullifier_tree_root, 4 },
            { C::tx_prev_nullifier_tree_size, 5 },
            { C::tx_prev_num_nullifiers_emitted, 6 },
            { C::tx_prev_public_data_tree_root, 7 },
            { C::tx_prev_public_data_tree_size, 8 },
            { C::tx_prev_written_public_data_slots_tree_root, 9 },
            { C::tx_prev_written_public_data_slots_tree_size, 10 },
            { C::tx_l1_l2_tree_root, 11 },
            { C::tx_prev_num_unencrypted_logs, 12 },
            { C::tx_prev_num_l2_to_l1_messages, 13 },
            { C::tx_next_note_hash_tree_root, 10 },
            { C::tx_next_note_hash_tree_size, 20 },
            { C::tx_next_num_note_hashes_emitted, 30 },
            { C::tx_next_nullifier_tree_root, 40 },
            { C::tx_next_nullifier_tree_size, 50 },
            { C::tx_next_num_nullifiers_emitted, 60 },
            { C::tx_next_public_data_tree_root, 70 },
            { C::tx_next_public_data_tree_size, 80 },
            { C::tx_next_written_public_data_slots_tree_root, 90 },
            { C::tx_next_written_public_data_slots_tree_size, 100 },
            { C::tx_next_num_unencrypted_logs, 120 },
            { C::tx_next_num_l2_to_l1_messages, 130 },
        },
        {
            // Row 2: restored end of setup state
            { C::tx_sel, 1 },
            { C::tx_reverted, 0 },
            { C::tx_prev_note_hash_tree_root, 1 },
            { C::tx_prev_note_hash_tree_size, 2 },
            { C::tx_prev_num_note_hashes_emitted, 3 },
            { C::tx_prev_nullifier_tree_root, 4 },
            { C::tx_prev_nullifier_tree_size, 5 },
            { C::tx_prev_num_nullifiers_emitted, 6 },
            { C::tx_prev_public_data_tree_root, 7 },
            { C::tx_prev_public_data_tree_size, 8 },
            { C::tx_prev_written_public_data_slots_tree_root, 9 },
            { C::tx_prev_written_public_data_slots_tree_size, 10 },
            { C::tx_l1_l2_tree_root, 11 },
            { C::tx_prev_num_unencrypted_logs, 12 },
            { C::tx_prev_num_l2_to_l1_messages, 13 },
        },
    });

    check_relation<tx_context>(trace,
                               tx_context::SR_NOTE_HASH_ROOT_CONTINUITY,
                               tx_context::SR_NOTE_HASH_TREE_SIZE_CONTINUITY,
                               tx_context::SR_NUM_NOTE_HASHES_EMITTED_CONTINUITY,
                               tx_context::SR_NULLIFIER_TREE_ROOT_CONTINUITY,
                               tx_context::SR_NULLIFIER_TREE_SIZE_CONTINUITY,
                               tx_context::SR_NUM_NULLIFIERS_EMITTED_CONTINUITY,
                               tx_context::SR_PUBLIC_DATA_TREE_ROOT_CONTINUITY,
                               tx_context::SR_PUBLIC_DATA_TREE_SIZE_CONTINUITY,
                               tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_CONTINUITY,
                               tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_CONTINUITY,
                               tx_context::SR_L1_L2_TREE_ROOT_CONTINUITY,
                               tx_context::SR_NUM_UNENCRYPTED_LOGS_CONTINUITY,
                               tx_context::SR_NUM_L2_TO_L1_MESSAGES_CONTINUITY);

    // Negative test: if not reverted, it shouldn't be able to rollback state from row 1 to row 2

    trace.set(C::tx_reverted, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_ROOT_CONTINUITY),
                              "NOTE_HASH_ROOT_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_TREE_SIZE_CONTINUITY),
                              "NOTE_HASH_TREE_SIZE_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NUM_NOTE_HASHES_EMITTED_CONTINUITY),
                              "NUM_NOTE_HASHES_EMITTED_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_TREE_ROOT_CONTINUITY),
                              "NULLIFIER_TREE_ROOT_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_TREE_SIZE_CONTINUITY),
                              "NULLIFIER_TREE_SIZE_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NUM_NULLIFIERS_EMITTED_CONTINUITY),
                              "NUM_NULLIFIERS_EMITTED_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_PUBLIC_DATA_TREE_ROOT_CONTINUITY),
                              "PUBLIC_DATA_TREE_ROOT_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_PUBLIC_DATA_TREE_SIZE_CONTINUITY),
                              "PUBLIC_DATA_TREE_SIZE_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_CONTINUITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_CONTINUITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NUM_UNENCRYPTED_LOGS_CONTINUITY),
                              "NUM_UNENCRYPTED_LOGS_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NUM_L2_TO_L1_MESSAGES_CONTINUITY),
                              "NUM_L2_TO_L1_MESSAGES_CONTINUITY");

    // Negative test: l1 to l2 root should not change

    trace.set(C::tx_l1_l2_tree_root, 1, 20);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_L1_L2_TREE_ROOT_CONTINUITY),
                              "L1_L2_TREE_ROOT_CONTINUITY");
}

TEST(TxContextConstrainingTest, StateMutability)
{
    TestTraceContainer trace({
        {
            { C::tx_sel, 1 },
            { C::tx_sel_can_emit_note_hash, 1 },
            { C::tx_sel_can_emit_nullifier, 1 },
            { C::tx_sel_can_write_public_data, 1 },
            { C::tx_sel_can_emit_unencrypted_log, 1 },
            { C::tx_sel_can_emit_l2_l1_msg, 1 },
            { C::tx_prev_note_hash_tree_root, 1 },
            { C::tx_prev_note_hash_tree_size, 2 },
            { C::tx_prev_num_note_hashes_emitted, 3 },
            { C::tx_prev_nullifier_tree_root, 4 },
            { C::tx_prev_nullifier_tree_size, 5 },
            { C::tx_prev_num_nullifiers_emitted, 6 },
            { C::tx_prev_public_data_tree_root, 7 },
            { C::tx_prev_public_data_tree_size, 8 },
            { C::tx_prev_written_public_data_slots_tree_root, 9 },
            { C::tx_prev_written_public_data_slots_tree_size, 10 },
            { C::tx_l1_l2_tree_root, 11 },
            { C::tx_prev_num_unencrypted_logs, 12 },
            { C::tx_prev_num_l2_to_l1_messages, 13 },
            { C::tx_next_note_hash_tree_root, 10 },
            { C::tx_next_note_hash_tree_size, 20 },
            { C::tx_next_num_note_hashes_emitted, 30 },
            { C::tx_next_nullifier_tree_root, 40 },
            { C::tx_next_nullifier_tree_size, 50 },
            { C::tx_next_num_nullifiers_emitted, 60 },
            { C::tx_next_public_data_tree_root, 70 },
            { C::tx_next_public_data_tree_size, 80 },
            { C::tx_next_written_public_data_slots_tree_root, 90 },
            { C::tx_next_written_public_data_slots_tree_size, 100 },
            { C::tx_l1_l2_tree_root, 110 },
            { C::tx_next_num_unencrypted_logs, 120 },
            { C::tx_next_num_l2_to_l1_messages, 130 },
        },
    });

    check_relation<tx_context>(trace,
                               tx_context::SR_NOTE_HASH_ROOT_IMMUTABILITY,
                               tx_context::SR_NOTE_HASH_SIZE_IMMUTABILITY,
                               tx_context::SR_NOTE_HASH_COUNT_IMMUTABILITY,
                               tx_context::SR_NULLIFIER_ROOT_IMMUTABILITY,
                               tx_context::SR_NULLIFIER_SIZE_IMMUTABILITY,
                               tx_context::SR_NULLIFIER_COUNT_IMMUTABILITY,
                               tx_context::SR_PUBLIC_DATA_ROOT_IMMUTABILITY,
                               tx_context::SR_PUBLIC_DATA_SIZE_IMMUTABILITY,
                               tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_ROOT_IMMUTABILITY,
                               tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_SIZE_IMMUTABILITY,
                               tx_context::SR_UNENCRYPTED_LOG_COUNT_IMMUTABILITY,
                               tx_context::SR_L2_TO_L1_MESSAGE_COUNT_IMMUTABILITY);

    // Negative test: immutability check on note hashes
    trace.set(C::tx_sel_can_emit_note_hash, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_ROOT_IMMUTABILITY),
                              "NOTE_HASH_ROOT_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_SIZE_IMMUTABILITY),
                              "NOTE_HASH_SIZE_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_COUNT_IMMUTABILITY),
                              "NOTE_HASH_COUNT_IMMUTABILITY");

    // Negative test: immutability check on nullifiers
    trace.set(C::tx_sel_can_emit_nullifier, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_ROOT_IMMUTABILITY),
                              "NULLIFIER_ROOT_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_SIZE_IMMUTABILITY),
                              "NULLIFIER_SIZE_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_COUNT_IMMUTABILITY),
                              "NULLIFIER_COUNT_IMMUTABILITY");

    // Negative test: immutability check on public data
    trace.set(C::tx_sel_can_write_public_data, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_PUBLIC_DATA_ROOT_IMMUTABILITY),
                              "PUBLIC_DATA_ROOT_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_PUBLIC_DATA_SIZE_IMMUTABILITY),
                              "PUBLIC_DATA_SIZE_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_ROOT_IMMUTABILITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_ROOT_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_SIZE_IMMUTABILITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_SIZE_IMMUTABILITY");

    // Negative test: immutability check on unencrypted logs
    trace.set(C::tx_sel_can_emit_unencrypted_log, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_UNENCRYPTED_LOG_COUNT_IMMUTABILITY),
                              "UNENCRYPTED_LOG_COUNT_IMMUTABILITY");

    // Negative test: immutability check on l2 to l1 messages
    trace.set(C::tx_sel_can_emit_l2_l1_msg, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_L2_TO_L1_MESSAGE_COUNT_IMMUTABILITY),
                              "L2_TO_L1_MESSAGE_COUNT_IMMUTABILITY");

    // Negative test: selectors enabled but it's a padded row
    trace.set(C::tx_sel_can_emit_note_hash, 0, 1);
    trace.set(C::tx_sel_can_emit_nullifier, 0, 1);
    trace.set(C::tx_sel_can_write_public_data, 0, 1);
    trace.set(C::tx_sel_can_emit_unencrypted_log, 0, 1);
    trace.set(C::tx_is_padded, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_ROOT_PADDED_IMMUTABILITY),
                              "NOTE_HASH_ROOT_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_SIZE_PADDED_IMMUTABILITY),
                              "NOTE_HASH_SIZE_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NOTE_HASH_COUNT_PADDED_IMMUTABILITY),
                              "NOTE_HASH_COUNT_PADDED_IMMUTABILITY");

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_ROOT_PADDED_IMMUTABILITY),
                              "NULLIFIER_ROOT_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_SIZE_PADDED_IMMUTABILITY),
                              "NULLIFIER_SIZE_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NULLIFIER_COUNT_PADDED_IMMUTABILITY),
                              "NULLIFIER_COUNT_PADDED_IMMUTABILITY");

    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_PUBLIC_DATA_ROOT_PADDED_IMMUTABILITY),
                              "PUBLIC_DATA_ROOT_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_PUBLIC_DATA_SIZE_PADDED_IMMUTABILITY),
                              "PUBLIC_DATA_SIZE_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_ROOT_PADDED_IMMUTABILITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_ROOT_PADDED_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_WRITTEN_PUBLIC_DATA_SLOTS_SIZE_PADDED_IMMUTABILITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_SIZE_PADDED_IMMUTABILITY");

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_UNENCRYPTED_LOG_COUNT_PADDED_IMMUTABILITY),
        "UNENCRYPTED_LOG_COUNT_PADDED_IMMUTABILITY");

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_L2_TO_L1_MESSAGE_COUNT_PADDED_IMMUTABILITY),
        "L2_TO_L1_MESSAGE_COUNT_PADDED_IMMUTABILITY");
}

} // namespace
} // namespace bb::avm2::constraining
