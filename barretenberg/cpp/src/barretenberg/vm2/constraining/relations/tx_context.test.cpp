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
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/tx_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using testing::PublicInputsBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
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
            { C::tx_next_retrieved_bytecodes_tree_root, 12 },
            { C::tx_next_retrieved_bytecodes_tree_size, 13 },
            { C::tx_next_num_unencrypted_log_fields, 14 },
            { C::tx_next_num_l2_to_l1_messages, 15 },
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
            { C::tx_prev_retrieved_bytecodes_tree_root, 12 },
            { C::tx_prev_retrieved_bytecodes_tree_size, 13 },
            { C::tx_prev_num_unencrypted_log_fields, 14 },
            { C::tx_prev_num_l2_to_l1_messages, 15 },
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
            { C::tx_next_retrieved_bytecodes_tree_root, 120 },
            { C::tx_next_retrieved_bytecodes_tree_size, 130 },
            { C::tx_next_num_unencrypted_log_fields, 140 },
            { C::tx_next_num_l2_to_l1_messages, 150 },
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
            { C::tx_prev_retrieved_bytecodes_tree_root, 120 },
            { C::tx_prev_retrieved_bytecodes_tree_size, 130 },
            { C::tx_prev_num_unencrypted_log_fields, 14 },
            { C::tx_prev_num_l2_to_l1_messages, 15 },
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
                               tx_context::SR_RETRIEVED_BYTECODES_TREE_ROOT_CONTINUITY,
                               tx_context::SR_RETRIEVED_BYTECODES_TREE_SIZE_CONTINUITY,
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

    // Negative test: even in reverts, retrieved bytecodes tree root and size should not change
    trace.set(C::tx_prev_retrieved_bytecodes_tree_root, 2, 12);
    trace.set(C::tx_prev_retrieved_bytecodes_tree_size, 2, 13);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_RETRIEVED_BYTECODES_TREE_ROOT_CONTINUITY),
        "RETRIEVED_BYTECODES_TREE_ROOT_CONTINUITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_RETRIEVED_BYTECODES_TREE_SIZE_CONTINUITY),
        "RETRIEVED_BYTECODES_TREE_SIZE_CONTINUITY");
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
            { C::tx_should_process_call_request, 1 },
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
            { C::tx_prev_retrieved_bytecodes_tree_root, 12 },
            { C::tx_prev_retrieved_bytecodes_tree_size, 13 },
            { C::tx_prev_num_unencrypted_log_fields, 13 },
            { C::tx_prev_num_l2_to_l1_messages, 14 },
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
            { C::tx_next_retrieved_bytecodes_tree_root, 120 },
            { C::tx_next_retrieved_bytecodes_tree_size, 130 },
            { C::tx_next_num_unencrypted_log_fields, 140 },
            { C::tx_next_num_l2_to_l1_messages, 150 },
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
                               tx_context::SR_RETRIEVED_BYTECODES_TREE_ROOT_IMMUTABILITY,
                               tx_context::SR_RETRIEVED_BYTECODES_TREE_SIZE_IMMUTABILITY,
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

    // Negative test: immutability check on retrieved bytecodes tree
    trace.set(C::tx_should_process_call_request, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_RETRIEVED_BYTECODES_TREE_ROOT_IMMUTABILITY),
        "RETRIEVED_BYTECODES_TREE_ROOT_IMMUTABILITY");
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_context>(trace, tx_context::SR_RETRIEVED_BYTECODES_TREE_SIZE_IMMUTABILITY),
        "RETRIEVED_BYTECODES_TREE_SIZE_IMMUTABILITY");

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

TEST(TxContextConstrainingTest, InitialStateChecks)
{
    Gas start_gas_used = { 1, 2 };
    Gas gas_limit = { 1000, 2000 };
    GasSettings gas_settings = { .gasLimits = gas_limit };
    TreeSnapshots tree_snapshots = { .l1ToL2MessageTree = { .root = 20, .nextAvailableLeafIndex = 19 },
                                     .noteHashTree = { .root = 21, .nextAvailableLeafIndex = 20 },
                                     .nullifierTree = { .root = 22, .nextAvailableLeafIndex = 21 },
                                     .publicDataTree = { .root = 23, .nextAvailableLeafIndex = 22 } };
    auto public_inputs = PublicInputsBuilder()
                             .with_start_gas_used(start_gas_used)
                             .with_gas_settings(gas_settings)
                             .with_start_tree_snapshots(tree_snapshots)
                             .build();

    TestTraceContainer trace({
        {
            // Row 0
            { C::precomputed_first_row, 1 },
        },
        {
            // Row 1
            { C::tx_sel, 1 },
            { C::tx_start_tx, 1 },
            { C::tx_prev_note_hash_tree_root, tree_snapshots.noteHashTree.root },
            { C::tx_prev_note_hash_tree_size, tree_snapshots.noteHashTree.nextAvailableLeafIndex },
            { C::tx_prev_nullifier_tree_root, tree_snapshots.nullifierTree.root },
            { C::tx_prev_nullifier_tree_size, tree_snapshots.nullifierTree.nextAvailableLeafIndex },
            { C::tx_prev_public_data_tree_root, tree_snapshots.publicDataTree.root },
            { C::tx_prev_public_data_tree_size, tree_snapshots.publicDataTree.nextAvailableLeafIndex },
            { C::tx_prev_written_public_data_slots_tree_root, FF(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_ROOT) },
            { C::tx_prev_written_public_data_slots_tree_size, FF(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE) },
            { C::tx_prev_retrieved_bytecodes_tree_root, FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT) },
            { C::tx_prev_retrieved_bytecodes_tree_size, FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE) },
            { C::tx_l1_l2_tree_root, tree_snapshots.l1ToL2MessageTree.root },
            { C::tx_prev_l2_gas_used, start_gas_used.l2Gas },
            { C::tx_prev_da_gas_used, start_gas_used.daGas },
            { C::tx_l2_gas_limit, gas_limit.l2Gas },
            { C::tx_da_gas_limit, gas_limit.daGas },
            { C::tx_prev_num_unencrypted_log_fields, 0 },
            { C::tx_prev_num_l2_to_l1_messages, 0 },
            { C::tx_note_hash_pi_offset, FF(AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX) },
            { C::tx_should_read_note_hash_tree, 1 },
            { C::tx_nullifier_pi_offset, FF(AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX) },
            { C::tx_should_read_nullifier_tree, 1 },
            { C::tx_public_data_pi_offset, FF(AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX) },
            { C::tx_should_read_public_data_tree, 1 },
            { C::tx_l1_l2_pi_offset, FF(AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX) },
            { C::tx_should_read_l1_l2_tree, 1 },
            { C::tx_gas_used_pi_offset, FF(AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX) },
            { C::tx_should_read_gas_used, 1 },
            { C::tx_gas_limit_pi_offset, FF(AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX) },
            { C::tx_should_read_gas_limit, 1 },
            { C::tx_next_note_hash_tree_root, tree_snapshots.noteHashTree.root },
            { C::tx_next_note_hash_tree_size, tree_snapshots.noteHashTree.nextAvailableLeafIndex },
            { C::tx_next_nullifier_tree_root, tree_snapshots.nullifierTree.root },
            { C::tx_next_nullifier_tree_size, tree_snapshots.nullifierTree.nextAvailableLeafIndex },
            { C::tx_next_public_data_tree_root, tree_snapshots.publicDataTree.root },
            { C::tx_next_public_data_tree_size, tree_snapshots.publicDataTree.nextAvailableLeafIndex },
            { C::tx_next_written_public_data_slots_tree_root, FF(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_ROOT) },
            { C::tx_next_written_public_data_slots_tree_size, FF(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE) },
            { C::tx_next_retrieved_bytecodes_tree_root, FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT) },
            { C::tx_next_retrieved_bytecodes_tree_size, FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE) },
            { C::tx_next_l2_gas_used, start_gas_used.l2Gas },
            { C::tx_next_da_gas_used, start_gas_used.daGas },
            { C::tx_setup_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
            { C::tx_next_context_id, 1 },
        },
    });

    PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());

    check_relation<tx_context>(trace);
    // All tx_context interactions
    check_interaction<TxTraceBuilder,
                      lookup_tx_context_public_inputs_note_hash_tree_settings,
                      lookup_tx_context_public_inputs_nullifier_tree_settings,
                      lookup_tx_context_public_inputs_public_data_tree_settings,
                      lookup_tx_context_public_inputs_l1_l2_tree_settings,
                      lookup_tx_context_public_inputs_gas_used_settings,
                      lookup_tx_context_public_inputs_read_gas_limit_settings,
                      lookup_tx_context_public_inputs_write_note_hash_count_settings,
                      lookup_tx_context_public_inputs_write_nullifier_count_settings,
                      lookup_tx_context_public_inputs_write_l2_to_l1_message_count_settings,
                      lookup_tx_context_public_inputs_write_unencrypted_log_count_settings,
                      lookup_tx_context_restore_state_on_revert_settings>(trace);
}

TEST(TxContextConstrainingTest, EndStateChecks)
{
    Gas end_gas_used = { 1, 2 };
    TreeSnapshots tree_snapshots = { .l1ToL2MessageTree = { .root = 20, .nextAvailableLeafIndex = 19 },
                                     .noteHashTree = { .root = 21, .nextAvailableLeafIndex = 20 },
                                     .nullifierTree = { .root = 22, .nextAvailableLeafIndex = 21 },
                                     .publicDataTree = { .root = 23, .nextAvailableLeafIndex = 22 } };
    AvmAccumulatedDataArrayLengths array_lengths = { .noteHashes = 10, .nullifiers = 11, .l2ToL1Msgs = 12 };

    PublicLog log = {
        .fields = { FF(4), FF(5) },
        .contractAddress = 11223,
    };
    PublicLogs public_logs = {};
    public_logs.add_log(log);
    AvmAccumulatedData accumulated_data = { .publicLogs = public_logs };

    auto public_inputs = PublicInputsBuilder()
                             .set_end_gas_used(end_gas_used)
                             .set_end_tree_snapshots(tree_snapshots)
                             .set_accumulated_data_array_lengths(array_lengths)
                             .set_accumulated_data(accumulated_data)
                             .build();

    TestTraceContainer trace({
        {
            // Row 0
            { C::precomputed_first_row, 1 },
        },
        {
            // Row 1
            { C::tx_sel, 1 },
            { C::tx_is_cleanup, 1 },
            { C::tx_prev_note_hash_tree_root, tree_snapshots.noteHashTree.root },
            { C::tx_prev_note_hash_tree_size, tree_snapshots.noteHashTree.nextAvailableLeafIndex },
            { C::tx_prev_num_note_hashes_emitted, array_lengths.noteHashes },
            { C::tx_prev_nullifier_tree_root, tree_snapshots.nullifierTree.root },
            { C::tx_prev_nullifier_tree_size, tree_snapshots.nullifierTree.nextAvailableLeafIndex },
            { C::tx_prev_num_nullifiers_emitted, array_lengths.nullifiers },
            { C::tx_prev_public_data_tree_root, tree_snapshots.publicDataTree.root },
            { C::tx_prev_public_data_tree_size, tree_snapshots.publicDataTree.nextAvailableLeafIndex },
            { C::tx_l1_l2_tree_root, tree_snapshots.l1ToL2MessageTree.root },
            { C::tx_prev_l2_gas_used, end_gas_used.l2Gas },
            { C::tx_prev_da_gas_used, end_gas_used.daGas },
            { C::tx_prev_num_unencrypted_log_fields, public_logs.length },
            { C::tx_prev_num_l2_to_l1_messages, array_lengths.l2ToL1Msgs },
            { C::tx_note_hash_pi_offset, FF(AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX) },
            { C::tx_should_read_note_hash_tree, 1 },
            { C::tx_nullifier_pi_offset, FF(AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX) },
            { C::tx_should_read_nullifier_tree, 1 },
            { C::tx_public_data_pi_offset, FF(AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX) },
            { C::tx_should_read_public_data_tree, 1 },
            { C::tx_l1_l2_pi_offset, FF(AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX) },
            { C::tx_should_read_l1_l2_tree, 1 },
            { C::tx_gas_used_pi_offset, FF(AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX) },
            { C::tx_should_read_gas_used, 1 },
            { C::tx_array_length_note_hashes_pi_offset,
              FF(AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX) },
            { C::tx_array_length_nullifiers_pi_offset,
              FF(AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX) },
            { C::tx_array_length_l2_to_l1_messages_pi_offset,
              FF(AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX) },
            { C::tx_fields_length_unencrypted_logs_pi_offset,
              FF(AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX) },
            { C::tx_next_note_hash_tree_root, tree_snapshots.noteHashTree.root },
            { C::tx_next_note_hash_tree_size, tree_snapshots.noteHashTree.nextAvailableLeafIndex },
            { C::tx_next_num_note_hashes_emitted, array_lengths.noteHashes },
            { C::tx_next_nullifier_tree_root, tree_snapshots.nullifierTree.root },
            { C::tx_next_nullifier_tree_size, tree_snapshots.nullifierTree.nextAvailableLeafIndex },
            { C::tx_next_num_nullifiers_emitted, array_lengths.nullifiers },
            { C::tx_next_public_data_tree_root, tree_snapshots.publicDataTree.root },
            { C::tx_next_public_data_tree_size, tree_snapshots.publicDataTree.nextAvailableLeafIndex },
            { C::tx_next_l2_gas_used, end_gas_used.l2Gas },
            { C::tx_next_da_gas_used, end_gas_used.daGas },
            { C::tx_next_num_unencrypted_log_fields, public_logs.length },
            { C::tx_next_num_l2_to_l1_messages, array_lengths.l2ToL1Msgs },
            { C::tx_setup_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
        },
    });

    PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());

    check_relation<tx_context>(trace);
    // All tx_context interactions
    check_interaction<TxTraceBuilder,
                      lookup_tx_context_public_inputs_note_hash_tree_settings,
                      lookup_tx_context_public_inputs_nullifier_tree_settings,
                      lookup_tx_context_public_inputs_public_data_tree_settings,
                      lookup_tx_context_public_inputs_l1_l2_tree_settings,
                      lookup_tx_context_public_inputs_gas_used_settings,
                      lookup_tx_context_public_inputs_read_gas_limit_settings,
                      lookup_tx_context_public_inputs_write_note_hash_count_settings,
                      lookup_tx_context_public_inputs_write_nullifier_count_settings,
                      lookup_tx_context_public_inputs_write_l2_to_l1_message_count_settings,
                      lookup_tx_context_public_inputs_write_unencrypted_log_count_settings,
                      lookup_tx_context_restore_state_on_revert_settings>(trace);
}

TEST(TxContextConstrainingTest, NegativeContextIdChecks)
{
    TestTraceContainer trace({
        {
            // Row 0
            { C::precomputed_first_row, 1 },
        },
        {
            // Row 1
            { C::tx_sel, 1 },
            { C::tx_start_tx, 1 },
            { C::tx_next_context_id, 1 },
        },
        {
            // Row 2
            { C::tx_sel, 1 },
            { C::tx_next_context_id, 1 },
            { C::tx_should_process_call_request, 1 },
        },
        {
            // Row 3
            { C::tx_sel, 1 },
            { C::tx_next_context_id, 5 },
        },
    });
    check_relation<tx_context>(
        trace, tx_context::SR_NEXT_CONTEXT_ID_CONTINUITY, tx_context::SR_NEXT_CONTEXT_ID_INITIAL_VALUE);

    // Negative test: initial context id should be 1
    trace.set(C::tx_next_context_id, 1, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NEXT_CONTEXT_ID_INITIAL_VALUE),
                              "NEXT_CONTEXT_ID_INITIAL_VALUE");

    // Negative test: continuity check
    trace.set(C::tx_next_context_id, 2, 42);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_context>(trace, tx_context::SR_NEXT_CONTEXT_ID_CONTINUITY),
                              "NEXT_CONTEXT_ID_CONTINUITY");
}

} // namespace
} // namespace bb::avm2::constraining
