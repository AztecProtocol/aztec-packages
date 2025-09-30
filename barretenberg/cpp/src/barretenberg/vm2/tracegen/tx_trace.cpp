#include "barretenberg/vm2/tracegen/tx_trace.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx.hpp"
// #include "barretenberg/vm2/generated/relations/lookups_tx_context.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx_context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"

#include <cstdint>
#include <unordered_map>
#include <variant>

namespace bb::avm2::tracegen {

namespace {

using simulation::PhaseLengths;
using simulation::TxContextEvent;

// helper type for the visitor #4
template <class... Ts> struct overloaded : Ts... {
    using Ts::operator()...;
};
// explicit deduction guide (not needed as of C++20)
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

// Helper to get phase length from PhaseLengths struct
uint32_t get_phase_length(const PhaseLengths& phase_lengths, TransactionPhase phase)
{
    switch (phase) {
    case TransactionPhase::NR_NULLIFIER_INSERTION:
        return phase_lengths.nr_nullifier_insertion;
    case TransactionPhase::NR_NOTE_INSERTION:
        return phase_lengths.nr_note_insertion;
    case TransactionPhase::NR_L2_TO_L1_MESSAGE:
        return phase_lengths.nr_l2_to_l1_message;
    case TransactionPhase::SETUP:
        return phase_lengths.setup;
    case TransactionPhase::R_NULLIFIER_INSERTION:
        return phase_lengths.r_nullifier_insertion;
    case TransactionPhase::R_NOTE_INSERTION:
        return phase_lengths.r_note_insertion;
    case TransactionPhase::R_L2_TO_L1_MESSAGE:
        return phase_lengths.r_l2_to_l1_message;
    case TransactionPhase::APP_LOGIC:
        return phase_lengths.app_logic;
    case TransactionPhase::TEARDOWN:
        return phase_lengths.teardown;
    default:
        return 1; // One-shot phases (COLLECT_GAS_FEES, TREE_PADDING, CLEANUP)
    }
}

constexpr size_t NUM_PHASES = static_cast<size_t>(TransactionPhase::LAST);

bool is_revertible(TransactionPhase phase)
{
    return phase == TransactionPhase::R_NOTE_INSERTION || phase == TransactionPhase::R_NULLIFIER_INSERTION ||
           phase == TransactionPhase::R_L2_TO_L1_MESSAGE || phase == TransactionPhase::APP_LOGIC ||
           phase == TransactionPhase::TEARDOWN;
}

bool is_note_hash_insert_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::NR_NOTE_INSERTION || phase == TransactionPhase::R_NOTE_INSERTION;
}

bool is_nullifier_insert_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::NR_NULLIFIER_INSERTION || phase == TransactionPhase::R_NULLIFIER_INSERTION;
}

bool is_tree_insert_phase(TransactionPhase phase)
{
    return is_note_hash_insert_phase(phase) || is_nullifier_insert_phase(phase);
}

bool is_l2_l1_msg_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::NR_L2_TO_L1_MESSAGE || phase == TransactionPhase::R_L2_TO_L1_MESSAGE;
}

bool is_public_call_request_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::SETUP || phase == TransactionPhase::APP_LOGIC ||
           phase == TransactionPhase::TEARDOWN;
}

bool is_collect_fee_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::COLLECT_GAS_FEES;
}

bool is_tree_padding_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::TREE_PADDING;
}

bool is_cleanup_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::CLEANUP;
}

bool is_one_shot_phase(TransactionPhase phase)
{
    return is_collect_fee_phase(phase) || is_tree_padding_phase(phase) || is_cleanup_phase(phase);
}

bool is_teardown_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::TEARDOWN;
}

// This is a helper to insert the previous and next tree state
std::vector<std::pair<Column, FF>> insert_state(const TxContextEvent& prev_state, const TxContextEvent& next_state)
{
    return {
        // Previous Tree State
        // Note Hash
        { Column::tx_prev_note_hash_tree_root, prev_state.tree_states.noteHashTree.tree.root },
        { Column::tx_prev_note_hash_tree_size, prev_state.tree_states.noteHashTree.tree.nextAvailableLeafIndex },
        { Column::tx_prev_num_note_hashes_emitted, prev_state.tree_states.noteHashTree.counter },
        // Nullifier Tree Roots
        { Column::tx_prev_nullifier_tree_root, prev_state.tree_states.nullifierTree.tree.root },
        { Column::tx_prev_nullifier_tree_size, prev_state.tree_states.nullifierTree.tree.nextAvailableLeafIndex },
        { Column::tx_prev_num_nullifiers_emitted, prev_state.tree_states.nullifierTree.counter },
        // Public Data Tree Roots
        { Column::tx_prev_public_data_tree_root, prev_state.tree_states.publicDataTree.tree.root },
        { Column::tx_prev_public_data_tree_size, prev_state.tree_states.publicDataTree.tree.nextAvailableLeafIndex },
        // Written Public Data Slots Tree Roots
        { Column::tx_prev_written_public_data_slots_tree_root,
          prev_state.written_public_data_slots_tree_snapshot.root },
        { Column::tx_prev_written_public_data_slots_tree_size,
          prev_state.written_public_data_slots_tree_snapshot.nextAvailableLeafIndex },
        // L1 to L2 Message Tree Roots
        { Column::tx_l1_l2_tree_root, prev_state.tree_states.l1ToL2MessageTree.tree.root },
        // Retrieved bytecodes Tree Roots
        { Column::tx_prev_retrieved_bytecodes_tree_root, prev_state.retrieved_bytecodes_tree_snapshot.root },
        { Column::tx_prev_retrieved_bytecodes_tree_size,
          prev_state.retrieved_bytecodes_tree_snapshot.nextAvailableLeafIndex },

        // Next Tree State
        { Column::tx_next_note_hash_tree_root, next_state.tree_states.noteHashTree.tree.root },
        { Column::tx_next_note_hash_tree_size, next_state.tree_states.noteHashTree.tree.nextAvailableLeafIndex },
        { Column::tx_next_num_note_hashes_emitted, next_state.tree_states.noteHashTree.counter },
        // Nullifier Tree Roots
        { Column::tx_next_nullifier_tree_root, next_state.tree_states.nullifierTree.tree.root },
        { Column::tx_next_nullifier_tree_size, next_state.tree_states.nullifierTree.tree.nextAvailableLeafIndex },
        { Column::tx_next_num_nullifiers_emitted, next_state.tree_states.nullifierTree.counter },
        // Public Data Tree Roots
        { Column::tx_next_public_data_tree_root, next_state.tree_states.publicDataTree.tree.root },
        { Column::tx_next_public_data_tree_size, next_state.tree_states.publicDataTree.tree.nextAvailableLeafIndex },
        // Written Public Data Slots Tree Roots
        { Column::tx_next_written_public_data_slots_tree_root,
          next_state.written_public_data_slots_tree_snapshot.root },
        { Column::tx_next_written_public_data_slots_tree_size,
          next_state.written_public_data_slots_tree_snapshot.nextAvailableLeafIndex },
        // Retrieved bytecodes Tree Roots
        { Column::tx_next_retrieved_bytecodes_tree_root, next_state.retrieved_bytecodes_tree_snapshot.root },
        { Column::tx_next_retrieved_bytecodes_tree_size,
          next_state.retrieved_bytecodes_tree_snapshot.nextAvailableLeafIndex },

        // Prev sideffect state
        { Column::tx_prev_num_unencrypted_log_fields, prev_state.side_effect_states.numUnencryptedLogFields },
        { Column::tx_prev_num_l2_to_l1_messages, prev_state.side_effect_states.numL2ToL1Messages },

        // Next sideffect state
        { Column::tx_next_num_unencrypted_log_fields, next_state.side_effect_states.numUnencryptedLogFields },
        { Column::tx_next_num_l2_to_l1_messages, next_state.side_effect_states.numL2ToL1Messages },

        // Execution context
        { Column::tx_next_context_id, prev_state.next_context_id },
    };
}

std::vector<std::pair<Column, FF>> insert_side_effect_states(const SideEffectStates& prev_side_effect_states,
                                                             const SideEffectStates& next_side_effect_states)
{
    return {
        {
            Column::tx_prev_num_unencrypted_log_fields,
            prev_side_effect_states.numUnencryptedLogFields,
        },
        {
            Column::tx_prev_num_l2_to_l1_messages,
            prev_side_effect_states.numL2ToL1Messages,
        },
        {
            Column::tx_next_num_unencrypted_log_fields,
            next_side_effect_states.numUnencryptedLogFields,
        },
        {
            Column::tx_next_num_l2_to_l1_messages,
            next_side_effect_states.numL2ToL1Messages,
        },
    };
}

// Helper to retrieve the read and write offsets and populate the read and write counters
std::vector<std::pair<Column, FF>> handle_pi_read(TransactionPhase phase, uint32_t phase_length, uint32_t read_counter)

{
    auto [read_offset, write_offset, length_offset] = TxPhaseOffsetsTable::get_offsets(phase);

    auto remaining_length = phase_length - read_counter;
    auto remaining_length_inv = remaining_length == 0 ? 0 : FF(remaining_length).invert();
    auto remaining_length_minus_one_inv = remaining_length - 1 == 0 ? 0 : FF(remaining_length - 1).invert();

    return {
        { Column::tx_read_pi_offset, read_offset + read_counter },
        { Column::tx_read_pi_length_offset, length_offset - read_counter },

        { Column::tx_remaining_phase_counter, remaining_length },
        { Column::tx_remaining_phase_inv, remaining_length_inv },
        { Column::tx_remaining_phase_minus_one_inv, remaining_length_minus_one_inv },
    };
}

std::vector<std::pair<Column, FF>> handle_prev_gas_used(Gas prev_gas_used)
{
    return {
        { Column::tx_prev_da_gas_used, prev_gas_used.daGas },
        { Column::tx_prev_l2_gas_used, prev_gas_used.l2Gas },
    };
}

std::vector<std::pair<Column, FF>> handle_next_gas_used(Gas next_gas_used)
{
    return {
        { Column::tx_next_da_gas_used, next_gas_used.daGas },
        { Column::tx_next_l2_gas_used, next_gas_used.l2Gas },
    };
}

std::vector<std::pair<Column, FF>> handle_gas_limit(Gas gas_limit)
{
    return {
        { Column::tx_da_gas_limit, gas_limit.daGas },
        { Column::tx_l2_gas_limit, gas_limit.l2Gas },
    };
}

std::vector<std::pair<Column, FF>> handle_enqueued_call_event(TransactionPhase phase,
                                                              const simulation::EnqueuedCallEvent& event)
{
    return { { Column::tx_is_public_call_request, 1 },
             { Column::tx_should_process_call_request, 1 },
             { Column::tx_is_teardown_phase, is_teardown_phase(phase) },
             { Column::tx_msg_sender, event.msg_sender },
             { Column::tx_contract_addr, event.contract_address },
             { Column::tx_fee, event.transaction_fee },
             { Column::tx_is_static, event.is_static },
             { Column::tx_calldata_size, event.calldata_size },
             { Column::tx_calldata_hash, event.calldata_hash },
             { Column::tx_reverted, !event.success },
             { Column::tx_prev_da_gas_used_sent_to_enqueued_call, event.start_gas.daGas },
             { Column::tx_prev_l2_gas_used_sent_to_enqueued_call, event.start_gas.l2Gas },
             { Column::tx_next_da_gas_used_sent_to_enqueued_call, event.end_gas.daGas },
             { Column::tx_next_l2_gas_used_sent_to_enqueued_call, event.end_gas.l2Gas },
             { Column::tx_gas_limit_pi_offset,
               is_teardown_phase(phase) ? AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX : 0 },
             { Column::tx_should_read_gas_limit, is_teardown_phase(phase) } };
};

std::vector<std::pair<Column, FF>> handle_note_hash_append(const simulation::PrivateAppendTreeEvent& event,
                                                           TransactionPhase phase,
                                                           const TxContextEvent& state_before,
                                                           bool reverted)
{
    uint32_t remaining_note_hashes = MAX_NOTE_HASHES_PER_TX - state_before.tree_states.noteHashTree.counter;

    return {
        { Column::tx_is_tree_insert_phase, 1 },
        { Column::tx_leaf_value, event.leaf_value },
        { Column::tx_remaining_side_effects_inv, remaining_note_hashes == 0 ? 0 : FF(remaining_note_hashes).invert() },
        { Column::tx_sel_non_revertible_append_note_hash, phase == TransactionPhase::NR_NOTE_INSERTION },
        { Column::tx_sel_revertible_append_note_hash, phase == TransactionPhase::R_NOTE_INSERTION },
        { Column::tx_should_try_note_hash_append, 1 },
        { Column::tx_should_note_hash_append, remaining_note_hashes > 0 },
        { Column::tx_reverted, reverted ? 1 : 0 },
    };
}

std::vector<std::pair<Column, FF>> handle_nullifier_append(const simulation::PrivateAppendTreeEvent& event,
                                                           TransactionPhase phase,
                                                           const TxContextEvent& state_before,
                                                           bool reverted)
{
    uint32_t remaining_nullifiers = MAX_NULLIFIERS_PER_TX - state_before.tree_states.nullifierTree.counter;

    return {
        { Column::tx_is_tree_insert_phase, 1 },
        { Column::tx_leaf_value, event.leaf_value },
        { Column::tx_remaining_side_effects_inv, remaining_nullifiers == 0 ? 0 : FF(remaining_nullifiers).invert() },
        { Column::tx_sel_non_revertible_append_nullifier, phase == TransactionPhase::NR_NULLIFIER_INSERTION },
        { Column::tx_sel_revertible_append_nullifier, phase == TransactionPhase::R_NULLIFIER_INSERTION },
        { Column::tx_should_try_nullifier_append, 1 },
        { Column::tx_should_nullifier_append, remaining_nullifiers > 0 },
        { Column::tx_reverted, reverted ? 1 : 0 },
    };
}

std::vector<std::pair<Column, FF>> handle_append_tree_event(const simulation::PrivateAppendTreeEvent& event,
                                                            TransactionPhase phase,
                                                            const TxContextEvent& state_before,
                                                            bool reverted)
{
    if (is_note_hash_insert_phase(phase)) {
        return handle_note_hash_append(event, phase, state_before, reverted);
    }
    if (is_nullifier_insert_phase(phase)) {
        return handle_nullifier_append(event, phase, state_before, reverted);
    }
    throw std::runtime_error("Invalid phase for append tree event");
}

std::vector<std::pair<Column, FF>> handle_l2_l1_msg_event(const simulation::PrivateEmitL2L1MessageEvent& event,
                                                          TransactionPhase phase,
                                                          const TxContextEvent& state_before,
                                                          bool reverted)
{
    uint32_t remaining_l2_to_l1_msgs = MAX_L2_TO_L1_MSGS_PER_TX - state_before.side_effect_states.numL2ToL1Messages;
    return {
        { Column::tx_sel_revertible_append_l2_l1_msg, phase == TransactionPhase::R_L2_TO_L1_MESSAGE },
        { Column::tx_sel_non_revertible_append_l2_l1_msg, phase == TransactionPhase::NR_L2_TO_L1_MESSAGE },
        { Column::tx_should_try_l2_l1_msg_append, 1 },
        { Column::tx_remaining_side_effects_inv,
          remaining_l2_to_l1_msgs == 0 ? 0 : FF(remaining_l2_to_l1_msgs).invert() },
        { Column::tx_should_l2_l1_msg_append, remaining_l2_to_l1_msgs > 0 },
        { Column::tx_l2_l1_msg_contract_address, event.scoped_msg.contractAddress },
        { Column::tx_l2_l1_msg_recipient, event.scoped_msg.message.recipient },
        { Column::tx_l2_l1_msg_content, event.scoped_msg.message.content },
        { Column::tx_write_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX +
              state_before.side_effect_states.numL2ToL1Messages },
        // Selectors
        { Column::tx_reverted, reverted ? 1 : 0 },
    };
}

std::vector<std::pair<Column, FF>> handle_collect_gas_fee_event(const simulation::CollectGasFeeEvent& event)
{
    return {
        { Column::tx_is_collect_fee, 1 },
        { Column::tx_effective_fee_per_da_gas, FF(event.effective_fee_per_da_gas) },
        { Column::tx_effective_fee_per_l2_gas, FF(event.effective_fee_per_l2_gas) },
        { Column::tx_fee_payer, event.fee_payer },
        { Column::tx_fee_payer_pi_offset, AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX },
        {
            Column::tx_fee,
            event.fee,
        },
        {
            Column::tx_fee_juice_contract_address,
            FEE_JUICE_ADDRESS,
        },
        {
            Column::tx_fee_juice_balances_slot,
            FEE_JUICE_BALANCES_SLOT,
        },
        {
            Column::tx_fee_juice_balance_slot,
            event.fee_juice_balance_slot,
        },
        {
            Column::tx_fee_payer_balance,
            event.fee_payer_balance,
        },
        {
            Column::tx_fee_payer_new_balance,
            event.fee_payer_balance - event.fee,
        },
        { Column::tx_uint32_max, 0xffffffff },
        { Column::tx_write_pi_offset, AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX },
    };
}

std::vector<std::pair<Column, FF>> handle_tree_padding()
{
    return {
        { Column::tx_is_tree_padding, 1 },
    };
}

std::vector<std::pair<Column, FF>> handle_cleanup()
{
    return {
        { Column::tx_is_cleanup, 1 },
        // End state
        { Column::tx_note_hash_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX },
        { Column::tx_should_read_note_hash_tree, 1 },
        { Column::tx_nullifier_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX },
        { Column::tx_should_read_nullifier_tree, 1 },
        { Column::tx_public_data_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX },
        { Column::tx_should_read_public_data_tree, 1 },
        { Column::tx_l1_l2_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX },
        { Column::tx_should_read_l1_l2_tree, 1 },
        { Column::tx_gas_used_pi_offset, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX },
        { Column::tx_should_read_gas_used, 1 },
        { Column::tx_array_length_note_hashes_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
        { Column::tx_array_length_nullifiers_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
        // Public data write counter is handled by the public data check trace due to squashing.
        { Column::tx_array_length_l2_to_l1_messages_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
        { Column::tx_fields_length_unencrypted_logs_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX },
    };
}

std::vector<std::pair<Column, FF>> handle_first_row()
{
    std::vector<std::pair<Column, FF>> columns = {
        { Column::tx_start_tx, 1 },
        { Column::tx_note_hash_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX },
        { Column::tx_should_read_note_hash_tree, 1 },
        { Column::tx_nullifier_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX },
        { Column::tx_should_read_nullifier_tree, 1 },
        { Column::tx_public_data_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX },
        { Column::tx_should_read_public_data_tree, 1 },
        { Column::tx_l1_l2_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX },
        { Column::tx_should_read_l1_l2_tree, 1 },
        { Column::tx_gas_used_pi_offset, AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX },
        { Column::tx_should_read_gas_used, 1 },
        { Column::tx_gas_limit_pi_offset, AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX },
        { Column::tx_should_read_gas_limit, 1 },
    };

    return columns;
}

std::vector<std::pair<Column, FF>> handle_padded_row(TransactionPhase phase, Gas gas_used, bool discard)
{
    // We should throw here - but tests are currently unsuitable
    // assert(phase != TransactionPhase::COLLECT_GAS_FEES);

    // TODO: We should probably split this into multiple functions, that are called if the padded phase is a specific
    // phase.
    std::vector<std::pair<Column, FF>> columns = {
        { Column::tx_sel, 1 },
        { Column::tx_discard, discard ? 1 : 0 },
        { Column::tx_phase_value, static_cast<uint8_t>(phase) },
        { Column::tx_setup_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
        { Column::tx_is_padded, 1 },
        { Column::tx_start_phase, 1 },
        { Column::tx_sel_read_phase_length, !is_one_shot_phase(phase) },
        // This is temporary because AvmVerifierTests.GoodPublicInputs doesnt collect gas fees, every transaction
        // needs a collect gas fee
        { Column::tx_is_collect_fee, is_collect_fee_phase(phase) ? 1 : 0 },
        { Column::tx_end_phase, 1 },
        // Selector specific
        { Column::tx_is_tree_insert_phase, is_tree_insert_phase(phase) ? 1 : 0 },
        { Column::tx_is_public_call_request, is_public_call_request_phase(phase) ? 1 : 0 },
        { Column::tx_is_collect_fee, is_collect_fee_phase(phase) ? 1 : 0 },

        { Column::tx_sel_revertible_append_note_hash, phase == TransactionPhase::R_NOTE_INSERTION ? 1 : 0 },
        { Column::tx_sel_revertible_append_nullifier, phase == TransactionPhase::R_NULLIFIER_INSERTION ? 1 : 0 },
        { Column::tx_sel_revertible_append_l2_l1_msg, phase == TransactionPhase::R_L2_TO_L1_MESSAGE ? 1 : 0 },
        { Column::tx_sel_non_revertible_append_note_hash, phase == TransactionPhase::NR_NOTE_INSERTION ? 1 : 0 },
        { Column::tx_sel_non_revertible_append_nullifier, phase == TransactionPhase::NR_NULLIFIER_INSERTION ? 1 : 0 },
        { Column::tx_sel_non_revertible_append_l2_l1_msg, phase == TransactionPhase::NR_L2_TO_L1_MESSAGE ? 1 : 0 },

        { Column::tx_is_collect_fee, is_collect_fee_phase(phase) ? 1 : 0 },

        { Column::tx_is_revertible, is_revertible(phase) ? 1 : 0 },
        // Public call request specific
        { Column::tx_is_teardown_phase, is_teardown_phase(phase) },
        { Column::tx_gas_limit_pi_offset,
          is_teardown_phase(phase) ? AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX : 0 },
        { Column::tx_should_read_gas_limit, is_teardown_phase(phase) },
        // Gas used does not change in padding rows
        { Column::tx_prev_da_gas_used_sent_to_enqueued_call,
          is_public_call_request_phase(phase) && phase != TransactionPhase::TEARDOWN ? gas_used.daGas : 0 },
        { Column::tx_prev_l2_gas_used_sent_to_enqueued_call,
          is_public_call_request_phase(phase) && phase != TransactionPhase::TEARDOWN ? gas_used.l2Gas : 0 },
        { Column::tx_next_da_gas_used_sent_to_enqueued_call,
          is_public_call_request_phase(phase) && phase != TransactionPhase::TEARDOWN ? gas_used.daGas : 0 },
        { Column::tx_next_l2_gas_used_sent_to_enqueued_call,
          is_public_call_request_phase(phase) && phase != TransactionPhase::TEARDOWN ? gas_used.l2Gas : 0 },
    };

    return columns;
}

std::vector<std::pair<Column, FF>> handle_state_change_selectors(TransactionPhase phase)
{
    return {
        { Column::tx_sel_can_emit_note_hash,
          is_note_hash_insert_phase(phase) || is_public_call_request_phase(phase) || is_tree_padding_phase(phase) },
        { Column::tx_sel_can_emit_nullifier,
          is_nullifier_insert_phase(phase) || is_public_call_request_phase(phase) || is_tree_padding_phase(phase) },
        { Column::tx_sel_can_write_public_data, is_collect_fee_phase(phase) || is_public_call_request_phase(phase) },
        { Column::tx_sel_can_emit_unencrypted_log, is_public_call_request_phase(phase) },
        { Column::tx_sel_can_emit_l2_l1_msg, is_l2_l1_msg_phase(phase) || is_public_call_request_phase(phase) },
    };
}

} // namespace

void TxTraceBuilder::process(const simulation::EventEmitterInterface<simulation::TxEvent>::Container& events,
                             TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Shifts

    // A nuance of the tracegen for the tx trace is that if there are no events in a phase, we still need to emit a
    // row for this "skipped" row. This row is needed to simplify the circuit constraints and ensure that we have
    // continuity in the tree state propagation

    // We bucket the events by phase to make it easier to detect phases with no events
    std::array<std::vector<const simulation::TxPhaseEvent*>, NUM_PHASES> phase_buckets = {};
    // We have the phases in iterable form so that in the main loop when we and empty phase
    // we can map back to this enum
    std::array<TransactionPhase, NUM_PHASES> phase_array = { TransactionPhase::NR_NULLIFIER_INSERTION,
                                                             TransactionPhase::NR_NOTE_INSERTION,
                                                             TransactionPhase::NR_L2_TO_L1_MESSAGE,
                                                             TransactionPhase::SETUP,
                                                             TransactionPhase::R_NULLIFIER_INSERTION,
                                                             TransactionPhase::R_NOTE_INSERTION,
                                                             TransactionPhase::R_L2_TO_L1_MESSAGE,
                                                             TransactionPhase::APP_LOGIC,
                                                             TransactionPhase::TEARDOWN,
                                                             TransactionPhase::COLLECT_GAS_FEES,
                                                             TransactionPhase::TREE_PADDING,
                                                             TransactionPhase::CLEANUP };

    std::optional<simulation::TxStartupEvent> startup_event;
    PhaseLengths phase_lengths{}; // Will be populated from startup event

    bool r_insertion_or_app_logic_failure = false;
    bool teardown_failure = false;
    for (const auto& tx_event : events) {
        if (std::holds_alternative<simulation::TxStartupEvent>(tx_event)) {
            startup_event = std::get<simulation::TxStartupEvent>(tx_event);
            phase_lengths = startup_event.value().phase_lengths;
        } else {
            const simulation::TxPhaseEvent& tx_phase_event = std::get<simulation::TxPhaseEvent>(tx_event);
            // Minus 1 since the enum is 1-indexed
            phase_buckets[static_cast<uint8_t>(tx_phase_event.phase) - 1].push_back(&tx_phase_event);

            // Set some flags for use when populating the discard column.
            if (tx_phase_event.reverted) {
                if (!is_revertible(tx_phase_event.phase)) {
                    throw std::runtime_error("Reverted in non-revertible phase: " +
                                             std::to_string(static_cast<uint8_t>(tx_phase_event.phase)));
                }

                if (tx_phase_event.phase == TransactionPhase::TEARDOWN) {
                    teardown_failure = true;
                } else {
                    r_insertion_or_app_logic_failure = true;
                }
            }
        }
    }

    if (!startup_event.has_value()) {
        throw std::runtime_error("Transaction startup event is missing");
    }

    const auto& startup_event_data = startup_event.value();

    // This is the tree state we will use during the "skipped" phases
    TxContextEvent propagated_state = startup_event_data.state;
    // Used to track the gas limit for the "padded" phases.
    Gas current_gas_limit = startup_event_data.gas_limit;
    Gas teardown_gas_limit = startup_event_data.teardown_gas_limit;
    Gas gas_used = startup_event_data.state.gas_used;

    // Go through each phase except startup and process the events in the phase
    for (uint32_t i = 0; i < NUM_PHASES; i++) {
        const auto& phase_events = phase_buckets[i];
        if (phase_events.empty()) {
            // There will be no events for a phase if it is skipped (jumped over) due to a revert.
            // This is different from a phase that has an EmptyPhaseEvent, which is a phase that has no contents to
            // process, like when app logic starts but has no enqueued calls.
            continue;
        }

        TransactionPhase phase = phase_array[i];

        bool discard = false;
        if (is_revertible(phase)) {
            if (phase == TransactionPhase::TEARDOWN) {
                discard = teardown_failure;
            } else {
                // Even if we don't fail until later in teardown, all revertible phases discard.
                discard = teardown_failure || r_insertion_or_app_logic_failure;
            }
        }

        if (is_teardown_phase(phase)) {
            current_gas_limit = teardown_gas_limit;
        }

        // Count the number of steps in this phase
        uint32_t phase_counter = 0;
        // Get the phase length from the startup event's phase_lengths
        // This represents how many items were specified for this phase in the transaction itself.
        // In case of a revert, we may process less items in a phase as we'll stop at the revert.
        uint32_t phase_length = get_phase_length(phase_lengths, phase);

        // We have events to process in this phase
        for (const auto& tx_phase_event : phase_events) {
            // We always set the tree state
            trace.set(row, insert_state(tx_phase_event->state_before, tx_phase_event->state_after));
            trace.set(row,
                      insert_side_effect_states(tx_phase_event->state_before.side_effect_states,
                                                tx_phase_event->state_after.side_effect_states));
            trace.set(
                row,
                { {
                    { C::tx_sel, 1 },
                    { C::tx_discard, discard ? 1 : 0 },
                    { C::tx_phase_value, static_cast<uint8_t>(tx_phase_event->phase) },
                    { Column::tx_setup_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
                    { C::tx_is_padded, 0 }, // overidden below if this is a skipped phase event
                    { C::tx_start_phase, phase_counter == 0 ? 1 : 0 },
                    { C::tx_sel_read_phase_length, phase_counter == 0 && !is_one_shot_phase(tx_phase_event->phase) },
                    { C::tx_is_revertible, is_revertible(tx_phase_event->phase) ? 1 : 0 },
                    { C::tx_end_phase, phase_counter == phase_events.size() - 1 ? 1 : 0 },
                } });
            trace.set(row, handle_prev_gas_used(gas_used));
            trace.set(row, handle_state_change_selectors(tx_phase_event->phase));
            if (row == 1) {
                trace.set(row, handle_first_row());
            }

            // Pattern match on the variant event type and call the appropriate handler
            std::visit(
                overloaded{ [&](const simulation::EnqueuedCallEvent& event) {
                               trace.set(row, handle_enqueued_call_event(tx_phase_event->phase, event));
                               // No explicit write counter for this phase
                               trace.set(row, handle_pi_read(tx_phase_event->phase, phase_length, phase_counter));

                               gas_used = tx_phase_event->state_after.gas_used;
                           },
                            [&](const simulation::PrivateAppendTreeEvent& event) {
                                trace.set(row,
                                          handle_append_tree_event(event,
                                                                   tx_phase_event->phase,
                                                                   tx_phase_event->state_before,
                                                                   tx_phase_event->reverted));

                                trace.set(row, handle_pi_read(tx_phase_event->phase, phase_length, phase_counter));
                            },
                            [&](const simulation::PrivateEmitL2L1MessageEvent& event) {
                                trace.set(row,
                                          handle_l2_l1_msg_event(event,
                                                                 tx_phase_event->phase,
                                                                 tx_phase_event->state_before,
                                                                 tx_phase_event->reverted));
                                trace.set(row, handle_pi_read(tx_phase_event->phase, phase_length, phase_counter));
                            },
                            [&](const simulation::CollectGasFeeEvent& event) {
                                trace.set(row, handle_pi_read(tx_phase_event->phase, 1, 0));
                                trace.set(row, handle_collect_gas_fee_event(event));
                            },
                            [&](const simulation::PadTreesEvent&) {
                                trace.set(row, handle_pi_read(tx_phase_event->phase, 1, 0));
                                trace.set(row, handle_tree_padding());
                            },
                            [&](const simulation::CleanupEvent&) {
                                trace.set(row, handle_pi_read(tx_phase_event->phase, 1, 0));
                                trace.set(row, handle_cleanup());
                            },
                            [&](const simulation::EmptyPhaseEvent&) {
                                // EmptyPhaseEvent represents a phase that is not explicitly skipped because of a
                                // revert, but just has no contents to process, like when app logic starts but has no
                                // enqueued calls.
                                trace.set(row, handle_pi_read(tx_phase_event->phase, 0, 0));
                                trace.set(row, handle_padded_row(tx_phase_event->phase, gas_used, discard));
                            } },
                tx_phase_event->event);
            trace.set(row, handle_next_gas_used(gas_used));
            trace.set(row, handle_gas_limit(current_gas_limit));

            phase_counter++;
            row++;
        }
        // In case we encounter another skip row
        propagated_state = phase_events.back()->state_after;
    }
}

const InteractionDefinition TxTraceBuilder::interactions =
    InteractionDefinition()
        // These are all generic, think which, if any, can be made sequential.
        .add<lookup_tx_read_phase_table_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_phase_jump_on_revert_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_phase_length_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_calldata_hash_settings, InteractionType::LookupSequential>()
        .add<lookup_tx_read_public_call_request_phase_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_dispatch_exec_start_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_dispatch_exec_end_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_tree_insert_value_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_l2_l1_msg_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_write_l2_l1_msg_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_effective_fee_public_inputs_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_fee_payer_public_inputs_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_balance_validation_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_note_hash_append_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_nullifier_append_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_balance_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_balance_update_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_write_fee_public_inputs_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_balance_slot_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_context_public_inputs_note_hash_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_nullifier_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_public_data_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_l1_l2_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_gas_used_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_read_gas_limit_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_note_hash_count_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_nullifier_count_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_l2_to_l1_message_count_settings,
             InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_unencrypted_log_count_settings,
             InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_restore_state_on_revert_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
