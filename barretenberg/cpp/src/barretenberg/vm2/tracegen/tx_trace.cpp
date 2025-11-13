#include "barretenberg/vm2/tracegen/tx_trace.hpp"

#include <array>
#include <cstdint>
#include <optional>
#include <utility>
#include <variant>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx_context.hpp"
#include "barretenberg/vm2/generated/relations/perms_tx.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"
#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"

namespace bb::avm2::tracegen {

namespace {

using C = Column;

using simulation::CollectGasFeeEvent;
using simulation::EnqueuedCallEvent;
using simulation::PhaseLengths;
using simulation::PrivateAppendTreeEvent;
using simulation::PrivateEmitL2L1MessageEvent;
using simulation::TxContextEvent;

// helper type for the visitor (See https://en.cppreference.com/w/cpp/utility/variant/visit)
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

constexpr size_t NUM_PHASES = static_cast<size_t>(TransactionPhase::LAST) + 1;

bool is_revertible(TransactionPhase phase)
{
    return TX_PHASE_SPEC_MAP.at(phase).is_revertible;
}

bool is_note_hash_insert_phase(TransactionPhase phase)
{
    return TX_PHASE_SPEC_MAP.at(phase).non_revertible_append_note_hash ||
           TX_PHASE_SPEC_MAP.at(phase).revertible_append_note_hash;
}

bool is_nullifier_insert_phase(TransactionPhase phase)
{
    return TX_PHASE_SPEC_MAP.at(phase).non_revertible_append_nullifier ||
           TX_PHASE_SPEC_MAP.at(phase).revertible_append_nullifier;
}

bool is_one_shot_phase(TransactionPhase phase)
{
    return TX_PHASE_SPEC_MAP.at(phase).is_collect_fee || TX_PHASE_SPEC_MAP.at(phase).is_tree_padding ||
           TX_PHASE_SPEC_MAP.at(phase).is_cleanup;
}

bool is_teardown(TransactionPhase phase)
{
    return TX_PHASE_SPEC_MAP.at(phase).is_teardown;
}

// This is a helper to insert the previous and next tree state
std::vector<std::pair<C, FF>> insert_tree_state(const TxContextEvent& prev_state, const TxContextEvent& next_state)
{
    return {
        // Previous Tree State
        // Note Hash
        { C::tx_prev_note_hash_tree_root, prev_state.tree_states.note_hash_tree.tree.root },
        { C::tx_prev_note_hash_tree_size, prev_state.tree_states.note_hash_tree.tree.next_available_leaf_index },
        { C::tx_prev_num_note_hashes_emitted, prev_state.tree_states.note_hash_tree.counter },
        // Nullifier Tree Roots
        { C::tx_prev_nullifier_tree_root, prev_state.tree_states.nullifier_tree.tree.root },
        { C::tx_prev_nullifier_tree_size, prev_state.tree_states.nullifier_tree.tree.next_available_leaf_index },
        { C::tx_prev_num_nullifiers_emitted, prev_state.tree_states.nullifier_tree.counter },
        // Public Data Tree Roots
        { C::tx_prev_public_data_tree_root, prev_state.tree_states.public_data_tree.tree.root },
        { C::tx_prev_public_data_tree_size,
          prev_state.tree_states.public_data_tree.tree.next_available_leaf_index },
        // Written Public Data Slots Tree Roots
        { C::tx_prev_written_public_data_slots_tree_root, prev_state.written_public_data_slots_tree_snapshot.root },
        { C::tx_prev_written_public_data_slots_tree_size,
          prev_state.written_public_data_slots_tree_snapshot.next_available_leaf_index },
        // L1 to L2 Message Tree Roots
        { C::tx_l1_l2_tree_root, prev_state.tree_states.l1_to_l2_message_tree.tree.root },
        // Retrieved bytecodes Tree Roots
        { C::tx_prev_retrieved_bytecodes_tree_root, prev_state.retrieved_bytecodes_tree_snapshot.root },
        { C::tx_prev_retrieved_bytecodes_tree_size,
          prev_state.retrieved_bytecodes_tree_snapshot.next_available_leaf_index },

        // Next Tree State
        { C::tx_next_note_hash_tree_root, next_state.tree_states.note_hash_tree.tree.root },
        { C::tx_next_note_hash_tree_size, next_state.tree_states.note_hash_tree.tree.next_available_leaf_index },
        { C::tx_next_num_note_hashes_emitted, next_state.tree_states.note_hash_tree.counter },
        // Nullifier Tree Roots
        { C::tx_next_nullifier_tree_root, next_state.tree_states.nullifier_tree.tree.root },
        { C::tx_next_nullifier_tree_size, next_state.tree_states.nullifier_tree.tree.next_available_leaf_index },
        { C::tx_next_num_nullifiers_emitted, next_state.tree_states.nullifier_tree.counter },
        // Public Data Tree Roots
        { C::tx_next_public_data_tree_root, next_state.tree_states.public_data_tree.tree.root },
        { C::tx_next_public_data_tree_size,
          next_state.tree_states.public_data_tree.tree.next_available_leaf_index },
        // Written Public Data Slots Tree Roots
        { C::tx_next_written_public_data_slots_tree_root, next_state.written_public_data_slots_tree_snapshot.root },
        { C::tx_next_written_public_data_slots_tree_size,
          next_state.written_public_data_slots_tree_snapshot.next_available_leaf_index },
        // Retrieved bytecodes Tree Roots
        { C::tx_next_retrieved_bytecodes_tree_root, next_state.retrieved_bytecodes_tree_snapshot.root },
        { C::tx_next_retrieved_bytecodes_tree_size,
          next_state.retrieved_bytecodes_tree_snapshot.next_available_leaf_index },

        // Execution context
        { C::tx_next_context_id, prev_state.next_context_id },
    };
}

std::vector<std::pair<C, FF>> insert_side_effect_states(const TxContextEvent& prev_state,
                                                        const TxContextEvent& next_state)
{
    return {
        { C::tx_prev_num_unencrypted_log_fields, prev_state.numUnencryptedLogFields },
        { C::tx_prev_num_l2_to_l1_messages, prev_state.numL2ToL1Messages },
        { C::tx_next_num_unencrypted_log_fields, next_state.numUnencryptedLogFields },
        { C::tx_next_num_l2_to_l1_messages, next_state.numL2ToL1Messages },
    };
}

// Helper to retrieve the read offset and populate the read and write counters
std::vector<std::pair<C, FF>> handle_pi_read(TransactionPhase phase, uint32_t phase_length, uint32_t read_counter)
{
    const auto& phase_spec = get_tx_phase_spec_map().at(phase);

    const auto remaining_length = phase_length - read_counter;

    return {
        { C::tx_read_pi_offset, phase_spec.read_pi_start_offset + read_counter },

        { C::tx_remaining_phase_counter, remaining_length },
        { C::tx_remaining_phase_inv, remaining_length },               // Will be inverted in batch later
        { C::tx_remaining_phase_minus_one_inv, remaining_length - 1 }, // Will be inverted in batch later
    };
}

std::vector<std::pair<C, FF>> handle_phase_spec(TransactionPhase phase)
{
    const auto& phase_spec = get_tx_phase_spec_map().at(phase);
    return {
        { C::tx_phase_value, static_cast<uint8_t>(phase) },
        { C::tx_is_public_call_request, phase_spec.is_public_call_request ? 1 : 0 },
        { C::tx_is_teardown, phase_spec.is_teardown ? 1 : 0 },
        { C::tx_is_collect_fee, phase_spec.is_collect_fee ? 1 : 0 },
        { C::tx_is_tree_padding, phase_spec.is_tree_padding ? 1 : 0 },
        { C::tx_is_cleanup, phase_spec.is_cleanup ? 1 : 0 },
        { C::tx_is_revertible, phase_spec.is_revertible ? 1 : 0 },
        { C::tx_read_pi_start_offset, phase_spec.read_pi_start_offset },
        { C::tx_read_pi_length_offset, phase_spec.read_pi_length_offset },
        { C::tx_sel_non_revertible_append_note_hash, phase_spec.non_revertible_append_note_hash ? 1 : 0 },
        { C::tx_sel_non_revertible_append_nullifier, phase_spec.non_revertible_append_nullifier ? 1 : 0 },
        { C::tx_sel_non_revertible_append_l2_l1_msg, phase_spec.non_revertible_append_l2_l1_msg ? 1 : 0 },
        { C::tx_sel_revertible_append_note_hash, phase_spec.revertible_append_note_hash ? 1 : 0 },
        { C::tx_sel_revertible_append_nullifier, phase_spec.revertible_append_nullifier ? 1 : 0 },
        { C::tx_sel_revertible_append_l2_l1_msg, phase_spec.revertible_append_l2_l1_msg ? 1 : 0 },
        { C::tx_sel_can_emit_note_hash, phase_spec.can_emit_note_hash ? 1 : 0 },
        { C::tx_sel_can_emit_nullifier, phase_spec.can_emit_nullifier ? 1 : 0 },
        { C::tx_sel_can_write_public_data, phase_spec.can_write_public_data ? 1 : 0 },
        { C::tx_sel_can_emit_unencrypted_log, phase_spec.can_emit_unencrypted_log ? 1 : 0 },
        { C::tx_sel_can_emit_l2_l1_msg, phase_spec.can_emit_l2_l1_msg ? 1 : 0 },
        { C::tx_next_phase_on_revert, phase_spec.next_phase_on_revert },

        // Directly derived from phase spec but not part of the phase spec struct.
        { C::tx_is_tree_insert_phase, (is_note_hash_insert_phase(phase) || is_nullifier_insert_phase(phase)) ? 1 : 0 },
    };
}

std::vector<std::pair<C, FF>> handle_prev_gas_used(Gas prev_gas_used)
{
    return {
        { C::tx_prev_da_gas_used, prev_gas_used.da_gas },
        { C::tx_prev_l2_gas_used, prev_gas_used.l2_gas },
    };
}

std::vector<std::pair<C, FF>> handle_next_gas_used(Gas next_gas_used)
{
    return {
        { C::tx_next_da_gas_used, next_gas_used.da_gas },
        { C::tx_next_l2_gas_used, next_gas_used.l2_gas },
    };
}

std::vector<std::pair<C, FF>> handle_gas_limit(Gas gas_limit)
{
    return {
        { C::tx_da_gas_limit, gas_limit.da_gas },
        { C::tx_l2_gas_limit, gas_limit.l2_gas },
    };
}

std::vector<std::pair<C, FF>> handle_enqueued_call_event(TransactionPhase phase, const EnqueuedCallEvent& event)
{
    return { { C::tx_should_process_call_request, 1 },
             { C::tx_msg_sender, event.msg_sender },
             { C::tx_contract_addr, event.contract_address },
             { C::tx_fee, event.transaction_fee },
             { C::tx_is_static, event.is_static },
             { C::tx_calldata_size, event.calldata_size },
             { C::tx_calldata_hash, event.calldata_hash },
             { C::tx_reverted, !event.success },
             { C::tx_prev_da_gas_used_sent_to_enqueued_call, event.start_gas.da_gas },
             { C::tx_prev_l2_gas_used_sent_to_enqueued_call, event.start_gas.l2_gas },
             { C::tx_next_da_gas_used_sent_to_enqueued_call, event.end_gas.da_gas },
             { C::tx_next_l2_gas_used_sent_to_enqueued_call, event.end_gas.l2_gas },
             { C::tx_gas_limit_pi_offset,
               is_teardown(phase) ? AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX : 0 },
             { C::tx_should_read_gas_limit, is_teardown(phase) ? 1 : 0 } };
}

std::vector<std::pair<C, FF>> handle_note_hash_append(const PrivateAppendTreeEvent& event,
                                                      const TxContextEvent& state_before)
{
    uint32_t remaining_note_hashes = MAX_NOTE_HASHES_PER_TX - state_before.tree_states.note_hash_tree.counter;

    return {
        { C::tx_leaf_value, event.leaf_value },
        { C::tx_remaining_side_effects_inv, remaining_note_hashes }, // Will be inverted in batch later
        { C::tx_should_try_note_hash_append, 1 },
        { C::tx_should_note_hash_append, remaining_note_hashes > 0 },
    };
}

std::vector<std::pair<C, FF>> handle_nullifier_append(const PrivateAppendTreeEvent& event,
                                                      const TxContextEvent& state_before)
{
    uint32_t remaining_nullifiers = MAX_NULLIFIERS_PER_TX - state_before.tree_states.nullifier_tree.counter;

    return {
        { C::tx_leaf_value, event.leaf_value },
        { C::tx_remaining_side_effects_inv, remaining_nullifiers }, // Will be inverted in batch later
        { C::tx_should_try_nullifier_append, 1 },
        { C::tx_should_nullifier_append, remaining_nullifiers > 0 },
    };
}

std::vector<std::pair<C, FF>> handle_append_tree_event(const PrivateAppendTreeEvent& event,
                                                       TransactionPhase phase,
                                                       const TxContextEvent& state_before)
{
    if (is_note_hash_insert_phase(phase)) {
        return handle_note_hash_append(event, state_before);
    }
    if (is_nullifier_insert_phase(phase)) {
        return handle_nullifier_append(event, state_before);
    }

    BB_ASSERT(false, format("Invalid phase for append tree event: ", static_cast<uint8_t>(phase)));
    return {};
}

std::vector<std::pair<C, FF>> handle_l2_l1_msg_event(const PrivateEmitL2L1MessageEvent& event,
                                                     const TxContextEvent& state_before)
{
    uint32_t remaining_l2_to_l1_msgs = MAX_L2_TO_L1_MSGS_PER_TX - state_before.numL2ToL1Messages;
    return {
        { C::tx_should_try_l2_l1_msg_append, 1 },
        { C::tx_remaining_side_effects_inv, remaining_l2_to_l1_msgs }, // Will be inverted in batch later
        { C::tx_should_l2_l1_msg_append, remaining_l2_to_l1_msgs > 0 },
        { C::tx_l2_l1_msg_contract_address, event.scoped_msg.contract_address },
        { C::tx_l2_l1_msg_recipient, event.scoped_msg.message.recipient },
        { C::tx_l2_l1_msg_content, event.scoped_msg.message.content },
        { C::tx_write_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + state_before.numL2ToL1Messages },
    };
}

std::vector<std::pair<C, FF>> handle_collect_gas_fee_event(const CollectGasFeeEvent& event)
{
    return {
        { C::tx_effective_fee_per_da_gas, FF(event.effective_fee_per_da_gas) },
        { C::tx_effective_fee_per_l2_gas, FF(event.effective_fee_per_l2_gas) },
        { C::tx_fee_payer, event.fee_payer },
        { C::tx_fee_payer_pi_offset, AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX },
        {
            C::tx_fee,
            event.fee,
        },
        {
            C::tx_fee_juice_contract_address,
            FEE_JUICE_ADDRESS,
        },
        {
            C::tx_fee_juice_balances_slot,
            FEE_JUICE_BALANCES_SLOT,
        },
        {
            C::tx_fee_juice_balance_slot,
            event.fee_juice_balance_slot,
        },
        {
            C::tx_fee_payer_balance,
            event.fee_payer_balance,
        },
        {
            C::tx_fee_payer_new_balance,
            event.fee_payer_balance - event.fee,
        },
        { C::tx_uint32_max, 0xffffffff },
        { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX },
    };
}

std::vector<std::pair<C, FF>> handle_cleanup()
{
    return {
        // End state
        { C::tx_sel_read_trees_and_gas_used, 1 },
        { C::tx_note_hash_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX },
        { C::tx_nullifier_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX },
        { C::tx_public_data_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX },
        { C::tx_l1_l2_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX },
        { C::tx_gas_used_pi_offset, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX },
        { C::tx_reverted_pi_offset, AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX },
        { C::tx_array_length_note_hashes_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
        { C::tx_array_length_nullifiers_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
        // Public data write counter is handled by the public data check trace due to squashing.
        { C::tx_array_length_l2_to_l1_messages_pi_offset,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
        { C::tx_fields_length_unencrypted_logs_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX },
    };
}

std::vector<std::pair<C, FF>> handle_first_row()
{
    std::vector<std::pair<C, FF>> columns = {
        { C::tx_start_tx, 1 },
        { C::tx_sel_read_trees_and_gas_used, 1 },
        { C::tx_note_hash_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX },
        { C::tx_nullifier_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX },
        { C::tx_public_data_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX },
        { C::tx_l1_l2_pi_offset, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX },
        { C::tx_gas_used_pi_offset, AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX },
        { C::tx_gas_limit_pi_offset, AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX },
        { C::tx_should_read_gas_limit, 1 },
    };

    return columns;
}

// Cannot happen for COLLECT_GAS_FEES, CLEANUP or TREE_PADDING.
std::vector<std::pair<C, FF>> handle_padded_row(TransactionPhase phase, const Gas& gas_used)
{
    std::vector<std::pair<C, FF>> columns = {
        { C::tx_is_padded, 1 },
        // Public call request specific
        { C::tx_gas_limit_pi_offset,
          is_teardown(phase) ? AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX : 0 },
        { C::tx_should_read_gas_limit, is_teardown(phase) ? 1 : 0 },
    };

    // Gas used does not change in padding rows
    if (get_tx_phase_spec_map().at(phase).is_public_call_request && !is_teardown(phase)) {
        columns.insert(columns.end(),
                       {
                           { C::tx_prev_da_gas_used_sent_to_enqueued_call, gas_used.da_gas },
                           { C::tx_prev_l2_gas_used_sent_to_enqueued_call, gas_used.l2_gas },
                           { C::tx_next_da_gas_used_sent_to_enqueued_call, gas_used.da_gas },
                           { C::tx_next_l2_gas_used_sent_to_enqueued_call, gas_used.l2_gas },
                       });
    }

    return columns;
}

} // namespace

void TxTraceBuilder::process(const simulation::EventEmitterInterface<simulation::TxEvent>::Container& events,
                             TraceContainer& trace)
{
    using simulation::CleanupEvent;
    using simulation::EmptyPhaseEvent;
    using simulation::PadTreesEvent;
    using simulation::TxPhaseEvent;
    using simulation::TxStartupEvent;

    uint32_t row = 1; // Shifts

    // A nuance of the tracegen for the tx trace is that if there are no events in a phase, we still need to emit a
    // row for this "skipped" row. This row is needed to simplify the circuit constraints and ensure that we have
    // continuity in the tree state propagation.

    // We bucket the events by phase to make it easier to detect phases with no events.
    std::array<std::vector<const TxPhaseEvent*>, NUM_PHASES> phase_buckets = {};
    // We have the phases in iterable form so that in the main loop when we and empty phase
    // we can map back to this enum

    std::optional<TxStartupEvent> startup_event;
    PhaseLengths phase_lengths{}; // Will be populated from startup event

    // Some flags used to populate the discard column.
    bool r_insertion_or_app_logic_failure = false;
    bool teardown_failure = false;

    // Pre-processing pass:
    // - extract the startup event and phase lengths.
    // - set the flags defined above.
    // - bucket the events by phase.
    for (const auto& tx_event : events) {
        if (std::holds_alternative<TxStartupEvent>(tx_event)) {
            startup_event = std::get<TxStartupEvent>(tx_event);
            phase_lengths = startup_event.value().phase_lengths;
        } else {
            const TxPhaseEvent& tx_phase_event = std::get<TxPhaseEvent>(tx_event);
            phase_buckets[static_cast<uint8_t>(tx_phase_event.phase)].push_back(&tx_phase_event);

            // Set some flags for use when populating the discard column.
            if (tx_phase_event.reverted) {
                // Simulation must have been aborted if we reverted in a non-revertible phase.
                BB_ASSERT(is_revertible(tx_phase_event.phase),
                          format("Reverted in non-revertible phase: ", static_cast<uint8_t>(tx_phase_event.phase)));

                if (is_teardown(tx_phase_event.phase)) {
                    teardown_failure = true;
                } else {
                    r_insertion_or_app_logic_failure = true;
                }
            }
        }
    }

    // Our simulation always emits a startup event.
    BB_ASSERT(startup_event.has_value(), "Transaction startup event is missing");

    const auto& startup_event_data = startup_event.value();

    // This is the tree state we will use during the "skipped" phases
    TxContextEvent propagated_state = startup_event_data.state;
    // Used to track the gas limit for the "padded" phases.
    Gas current_gas_limit = startup_event_data.gas_limit;
    const Gas& teardown_gas_limit = startup_event_data.teardown_gas_limit;
    Gas gas_used = startup_event_data.state.gas_used;
    // Track whether this tx reverted
    bool tx_reverted = false;

    // From here we start populating the trace.

    trace.set(row, handle_first_row());

    // Go through each phase except startup and process the events in the phase
    for (uint32_t i = 0; i < NUM_PHASES; i++) {
        const auto& phase_events = phase_buckets[i];
        if (phase_events.empty()) {
            // There will be no events for a phase if it is skipped (jumped over) due to a revert.
            // This is different from a phase that has an EmptyPhaseEvent, which is a phase that has no contents to
            // process, like when app logic starts but has no enqueued calls.
            continue;
        }

        const TransactionPhase phase = static_cast<TransactionPhase>(i);

        bool discard = false;
        if (is_revertible(phase)) {
            if (is_teardown(phase)) {
                discard = teardown_failure;
            } else {
                // Even if we don't fail until later in teardown, all revertible phases discard.
                discard = teardown_failure || r_insertion_or_app_logic_failure;
            }
        }

        if (is_teardown(phase)) {
            current_gas_limit = teardown_gas_limit;
        }

        // Count the number of steps in this phase
        uint32_t phase_counter = 0;
        // Get the phase length from the startup event's phase_lengths
        // This represents how many items were specified for this phase in the transaction itself.
        // In case of a revert, we may process less items in a phase as we'll stop at the revert.
        const uint32_t phase_length = get_phase_length(phase_lengths, phase);

        // We have events to process in this phase
        for (const auto* tx_phase_event : phase_events) {
            // If this phase is the first revert, set tx_reverted:
            tx_reverted = tx_reverted || tx_phase_event->reverted;

            // Generic selectors and values common to all phase events.
            trace.set(row,
                      { {
                          { C::tx_sel, 1 },
                          { C::tx_discard, discard ? 1 : 0 },
                          { C::tx_reverted, tx_phase_event->reverted ? 1 : 0 },
                          { C::tx_tx_reverted, tx_reverted ? 1 : 0 },
                          { C::tx_setup_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
                          { C::tx_start_phase, phase_counter == 0 ? 1 : 0 },
                          { C::tx_sel_read_phase_length, (phase_counter == 0 && !is_one_shot_phase(phase)) ? 1 : 0 },
                          { C::tx_end_phase, phase_counter == phase_events.size() - 1 ? 1 : 0 },
                      } });

            // Populate all phase_spec related columns
            trace.set(row, handle_phase_spec(phase));

            // We always set the tree state and side effect states
            trace.set(row, insert_tree_state(tx_phase_event->state_before, tx_phase_event->state_after));
            trace.set(row, insert_side_effect_states(tx_phase_event->state_before, tx_phase_event->state_after));
            trace.set(row, handle_prev_gas_used(gas_used));

            // Pattern match on the variant event type and call the appropriate handler
            std::visit(overloaded{ [&](const EnqueuedCallEvent& event) {
                                      trace.set(row, handle_enqueued_call_event(phase, event));
                                      // No explicit write counter for this phase
                                      trace.set(row, handle_pi_read(phase, phase_length, phase_counter));

                                      gas_used = tx_phase_event->state_after.gas_used;
                                  },
                                   [&](const PrivateAppendTreeEvent& event) {
                                       trace.set(row,
                                                 handle_append_tree_event(event, phase, tx_phase_event->state_before));
                                       trace.set(row, handle_pi_read(phase, phase_length, phase_counter));
                                   },
                                   [&](const PrivateEmitL2L1MessageEvent& event) {
                                       trace.set(row, handle_l2_l1_msg_event(event, tx_phase_event->state_before));
                                       trace.set(row, handle_pi_read(phase, phase_length, phase_counter));
                                   },
                                   [&](const CollectGasFeeEvent& event) {
                                       trace.set(row, handle_collect_gas_fee_event(event));
                                       trace.set(row, handle_pi_read(phase, 1, 0));
                                   },
                                   [&](const PadTreesEvent&) { trace.set(row, handle_pi_read(phase, 1, 0)); },
                                   [&](const CleanupEvent&) {
                                       trace.set(row, handle_cleanup());
                                       trace.set(row, handle_pi_read(phase, 1, 0));
                                   },
                                   [&](const EmptyPhaseEvent&) {
                                       // EmptyPhaseEvent represents a phase that is not explicitly skipped because of a
                                       // revert, but just has no contents to process, like when app logic starts but
                                       // has no enqueued calls.
                                       trace.set(row, handle_padded_row(phase, gas_used));
                                       trace.set(row, handle_pi_read(phase, 0, 0));
                                   } },
                       tx_phase_event->event);

            trace.set(row, handle_next_gas_used(gas_used));
            trace.set(row, handle_gas_limit(current_gas_limit));

            phase_counter++; // Inner loop counter.
            row++;
        }
        // In case we encounter another skip row
        propagated_state = phase_events.back()->state_after;
    }

    // Batch invert the columns.
    trace.invert_columns(
        { { C::tx_remaining_phase_inv, C::tx_remaining_phase_minus_one_inv, C::tx_remaining_side_effects_inv } });
}

const InteractionDefinition TxTraceBuilder::interactions =
    InteractionDefinition()
        // These are all generic, think which, if any, can be made sequential.
        .add<lookup_tx_read_phase_spec_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_read_phase_length_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_calldata_hash_settings, InteractionType::LookupSequential>()
        .add<lookup_tx_read_public_call_request_phase_settings, InteractionType::LookupGeneric>()
        .add<perm_tx_dispatch_exec_start_settings, InteractionType::Permutation>()
        .add<perm_tx_dispatch_exec_end_settings, InteractionType::Permutation>()
        .add<lookup_tx_read_tree_insert_value_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_l2_l1_msg_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_write_l2_l1_msg_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_effective_fee_public_inputs_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_read_fee_payer_public_inputs_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_balance_validation_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_note_hash_append_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_nullifier_append_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_balance_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_write_fee_public_inputs_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_balance_slot_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_tx_context_public_inputs_note_hash_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_nullifier_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_public_data_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_l1_l2_tree_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_gas_used_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_read_gas_limit_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_read_reverted_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_note_hash_count_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_nullifier_count_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_l2_to_l1_message_count_settings,
             InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_public_inputs_write_unencrypted_log_count_settings,
             InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_tx_context_restore_state_on_revert_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
