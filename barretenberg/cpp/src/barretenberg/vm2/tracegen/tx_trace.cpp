#include "barretenberg/vm2/tracegen/tx_trace.hpp"

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"
#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"

#include <cstdint>
#include <unordered_map>
#include <variant>

namespace bb::avm2::tracegen {

namespace {

// helper type for the visitor #4
template <class... Ts> struct overloaded : Ts... {
    using Ts::operator()...;
};
// explicit deduction guide (not needed as of C++20)
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

constexpr size_t NUM_PHASES = 10; // See TransactionPhase enum

bool is_revertible(TransactionPhase phase)
{
    return phase == TransactionPhase::R_NOTE_INSERTION || phase == TransactionPhase::R_NULLIFIER_INSERTION ||
           phase == TransactionPhase::R_L2_TO_L1_MESSAGE || phase == TransactionPhase::APP_LOGIC ||
           phase == TransactionPhase::TEARDOWN;
}

bool is_tree_insert_phase(TransactionPhase phase)
{
    return phase == TransactionPhase::NR_NOTE_INSERTION || phase == TransactionPhase::NR_NULLIFIER_INSERTION ||
           phase == TransactionPhase::R_NOTE_INSERTION || phase == TransactionPhase::R_NULLIFIER_INSERTION;
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

// This is a helper to insert the previous and next tree state
std::vector<std::pair<Column, FF>> insert_tree_state(const TreeStates& prev_tree_state,
                                                     const TreeStates& next_tree_state)
{
    return {
        // Previous Tree State
        // Note Hash
        { Column::tx_prev_note_hash_tree_root, prev_tree_state.noteHashTree.tree.root },
        { Column::tx_prev_note_hash_tree_size, prev_tree_state.noteHashTree.tree.nextAvailableLeafIndex },
        { Column::tx_prev_num_note_hashes_emitted, prev_tree_state.noteHashTree.counter },
        // Nullifier Tree Roots
        { Column::tx_prev_nullifier_tree_root, prev_tree_state.nullifierTree.tree.root },
        { Column::tx_prev_nullifier_tree_size, prev_tree_state.nullifierTree.tree.nextAvailableLeafIndex },
        { Column::tx_prev_num_nullifiers_emitted, prev_tree_state.nullifierTree.counter },
        // Public Data Tree Roots
        { Column::tx_prev_public_data_tree_root, prev_tree_state.publicDataTree.tree.root },
        { Column::tx_prev_public_data_tree_size, prev_tree_state.publicDataTree.tree.nextAvailableLeafIndex },
        { Column::tx_prev_num_pub_data_writes_emitted, prev_tree_state.publicDataTree.counter },
        // L1 to L2 Message Tree Roots
        { Column::tx_prev_l1_l2_tree_root, prev_tree_state.l1ToL2MessageTree.tree.root },
        { Column::tx_prev_l1_l2_tree_size, prev_tree_state.l1ToL2MessageTree.tree.nextAvailableLeafIndex },

        // Next Tree State
        { Column::tx_next_note_hash_tree_root, next_tree_state.noteHashTree.tree.root },
        { Column::tx_next_note_hash_tree_size, next_tree_state.noteHashTree.tree.nextAvailableLeafIndex },
        { Column::tx_next_num_note_hashes_emitted, next_tree_state.noteHashTree.counter },
        // Nullifier Tree Roots
        { Column::tx_next_nullifier_tree_root, next_tree_state.nullifierTree.tree.root },
        { Column::tx_next_nullifier_tree_size, next_tree_state.nullifierTree.tree.nextAvailableLeafIndex },
        { Column::tx_next_num_nullifiers_emitted, next_tree_state.nullifierTree.counter },
        // Public Data Tree Roots
        { Column::tx_next_public_data_tree_root, next_tree_state.publicDataTree.tree.root },
        { Column::tx_next_public_data_tree_size, next_tree_state.publicDataTree.tree.nextAvailableLeafIndex },
        { Column::tx_next_num_pub_data_writes_emitted, next_tree_state.publicDataTree.counter },
        // L1 to L2 Message Tree Roots
        { Column::tx_next_l1_l2_tree_root, next_tree_state.l1ToL2MessageTree.tree.root },
        { Column::tx_next_l1_l2_tree_size, next_tree_state.l1ToL2MessageTree.tree.nextAvailableLeafIndex },
    };
}

// Helper to retrieve the read and write offsets and populate the read and write counters
std::vector<std::pair<Column, FF>> handle_pi_read_write(TransactionPhase phase,
                                                        uint32_t phase_length,
                                                        uint32_t read_counter,
                                                        uint32_t write_counter)

{
    auto [read_offset, write_offset, length_offset] = TxPhaseOffsetsTable::get_offsets(phase);

    auto remaining_length = phase_length - read_counter;
    auto remaining_length_inv = remaining_length == 0 ? 0 : FF(remaining_length).invert();
    auto remaining_length_minus_one_inv = remaining_length - 1 == 0 ? 0 : FF(remaining_length - 1).invert();

    return {
        { Column::tx_read_pi_offset, read_offset + read_counter },
        { Column::tx_read_pi_length_offset, length_offset - read_counter },
        { Column::tx_write_pi_offset, write_offset + write_counter },

        { Column::tx_remaining_phase_counter, remaining_length },
        { Column::tx_remaining_phase_inv, remaining_length_inv },
        { Column::tx_remaining_phase_minus_one_inv, remaining_length_minus_one_inv },
    };
}

std::vector<std::pair<Column, FF>> handle_enqueued_call_event(const simulation::EnqueuedCallEvent& event)
{
    return {
        { Column::tx_is_public_call_request, 1 },
        { Column::tx_msg_sender, event.msg_sender },
        { Column::tx_contract_addr, event.contract_address },
        { Column::tx_is_static, event.is_static },
        { Column::tx_calldata_hash, event.calldata_hash },
        { Column::tx_reverted, event.success },
    };
};

std::vector<std::pair<Column, FF>> handle_append_tree_event(const simulation::PrivateAppendTreeEvent& event,
                                                            TransactionPhase phase,
                                                            bool reverted)
{
    return {
        { Column::tx_is_tree_insert_phase, 1 },
        { Column::tx_leaf_value, event.leaf_value },

        // Selectors
        { Column::tx_sel_non_revertible_append_note_hash, phase == TransactionPhase::NR_NOTE_INSERTION },
        { Column::tx_sel_non_revertible_append_nullifier, phase == TransactionPhase::NR_NULLIFIER_INSERTION },
        { Column::tx_sel_revertible_append_note_hash, phase == TransactionPhase::R_NOTE_INSERTION },
        { Column::tx_sel_revertible_append_nullifier, phase == TransactionPhase::R_NULLIFIER_INSERTION },

        // Revertible
        { Column::tx_successful_tree_insert, reverted ? 0 : 1 },
        { Column::tx_reverted, reverted ? 1 : 0 },
    };
}

std::vector<std::pair<Column, FF>> handle_l2_l1_msg_event(const simulation::PrivateEmitL2L1MessageEvent& event,
                                                          uint32_t l2_l1_msg_counter,
                                                          bool reverted)
{
    return {
        { Column::tx_is_l2_l1_msg_phase, 1 },

        { Column::tx_l2_l1_msg_contract_address, event.scoped_msg.contractAddress },
        { Column::tx_l2_l1_msg_recipient, event.scoped_msg.message.recipient },
        { Column::tx_l2_l1_msg_content, event.scoped_msg.message.content },
        { Column::tx_num_l2_l1_msg_emitted, l2_l1_msg_counter },
        // Selectors
        { Column::tx_reverted, reverted ? 1 : 0 },
        { Column::tx_successful_msg_emit, reverted ? 0 : 1 },
    };
}

std::vector<std::pair<Column, FF>> handle_collect_gas_fee_event(const simulation::CollectGasFeeEvent& event)
{
    return {
        { Column::tx_is_collect_fee, 1 },

        // TODO compute fee

        { Column::tx_fee_per_da_gas, uint256_t::from_uint128(event.fee_per_da_gas) },
        { Column::tx_fee_per_l2_gas, uint256_t::from_uint128(event.fee_per_l2_gas) },
        { Column::tx_max_fee_per_da_gas, uint256_t::from_uint128(event.max_fee_per_da_gas) },
        { Column::tx_max_fee_per_l2_gas, uint256_t::from_uint128(event.max_fee_per_l2_gas) },
        { Column::tx_max_priority_fees_per_l2_gas, uint256_t::from_uint128(event.max_priority_fees_per_l2_gas) },
        { Column::tx_max_priority_fees_per_da_gas, uint256_t::from_uint128(event.max_priority_fees_per_da_gas) },
    };
}

std::vector<std::pair<Column, FF>> handle_padded_row(TransactionPhase phase)
{
    // We should throw here - but tests are currently unsuitable
    // assert(phase != TransactionPhase::COLLECT_GAS_FEES);

    return {
        { Column::tx_sel, 1 },
        { Column::tx_phase_value, static_cast<uint8_t>(phase) },
        { Column::tx_is_padded, 1 },
        { Column::tx_start_phase, 1 },
        { Column::tx_sel_read_phase_length, phase == TransactionPhase::COLLECT_GAS_FEES ? 0 : 1 },
        // This is temporary because AvmVerifierTests.GoodPublicInputs doesnt collect gas fees, every transaction
        // needs a collect gas fee
        { Column::tx_is_collect_fee, phase == TransactionPhase::COLLECT_GAS_FEES ? 1 : 0 },
        { Column::tx_end_phase, 1 },
        // Selector specific
        { Column::tx_is_tree_insert_phase, is_tree_insert_phase(phase) ? 1 : 0 },
        { Column::tx_is_public_call_request, is_public_call_request_phase(phase) ? 1 : 0 },
        { Column::tx_is_l2_l1_msg_phase, is_l2_l1_msg_phase(phase) ? 1 : 0 },
        { Column::tx_is_collect_fee, is_collect_fee_phase(phase) ? 1 : 0 },

        { Column::tx_sel_revertible_append_note_hash, phase == TransactionPhase::R_NOTE_INSERTION ? 1 : 0 },
        { Column::tx_sel_revertible_append_nullifier, phase == TransactionPhase::R_NULLIFIER_INSERTION ? 1 : 0 },
        { Column::tx_sel_non_revertible_append_note_hash, phase == TransactionPhase::NR_NOTE_INSERTION ? 1 : 0 },
        { Column::tx_sel_non_revertible_append_nullifier, phase == TransactionPhase::NR_NULLIFIER_INSERTION ? 1 : 0 },

        { Column::tx_is_collect_fee, is_collect_fee_phase(phase) ? 1 : 0 },

        { Column::tx_is_revertible, is_revertible(phase) ? 1 : 0 },

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
    std::array<std::vector<const simulation::TxEvent*>, NUM_PHASES> phase_buckets = {};
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
                                                             TransactionPhase::COLLECT_GAS_FEES };

    for (const auto& tx_event : events) {
        // Minus 1 since the enum is 1-indexed
        phase_buckets[static_cast<uint8_t>(tx_event.phase) - 1].push_back(&tx_event);
    }

    // We keep the msg counter across the phases since it is not tracked in the event
    uint32_t l2_l1_msg_counter = 0;
    // This is the tree state we will use during the "skipped" phases
    TreeStates propagated_tree_state = {};

    // We should not have an empty events list since that is an invalid proof
    // should this be an assert?
    if (!events.empty()) {
        propagated_tree_state = events[0].prev_tree_state;
    }

    // Go through each phase and process the events in the phase
    for (uint32_t i = 0; i < NUM_PHASES; i++) {
        const auto& phase = phase_buckets[i];
        if (phase.empty()) {
            TransactionPhase phase = phase_array[i];
            trace.set(row, insert_tree_state(propagated_tree_state, propagated_tree_state));
            trace.set(row, handle_padded_row(phase));
            trace.set(row, handle_pi_read_write(phase, /*phase_length=*/0, /*read_counter*/ 0, /*write_counter=*/0));
            row++;
            continue;
        }
        // We have events to process in this phase
        for (const auto& tx_event : phase) {
            // Count the number of steps in this phase
            uint32_t phase_counter = 0;
            uint32_t phase_length = static_cast<uint32_t>(phase.size());
            // We alway set the tree state
            trace.set(row, insert_tree_state(tx_event->prev_tree_state, tx_event->next_tree_state));
            trace.set(row,
                      { {
                          { C::tx_sel, 1 },
                          { C::tx_phase_value, static_cast<uint8_t>(tx_event->phase) },
                          { C::tx_is_padded, 0 },
                          { C::tx_start_phase, phase_counter == 0 ? 1 : 0 },
                          { C::tx_sel_read_phase_length,
                            phase_counter == 0 && tx_event->phase != TransactionPhase::COLLECT_GAS_FEES ? 1 : 0 },
                          { C::tx_is_revertible, is_revertible(tx_event->phase) ? 1 : 0 },

                          { C::tx_end_phase, phase_counter == phase.size() - 1 ? 1 : 0 },
                      } });

            // Pattern match on the variant event type and call the appropriate handler
            std::visit(
                overloaded{
                    [&](const simulation::EnqueuedCallEvent& event) {
                        trace.set(row, handle_enqueued_call_event(event));
                        // No explicit write counter for this phase
                        trace.set(
                            row,
                            handle_pi_read_write(tx_event->phase, phase_length, phase_counter, /*write_counter=*/0));
                    },
                    [&](const simulation::PrivateAppendTreeEvent& event) {
                        trace.set(row, handle_append_tree_event(event, tx_event->phase, tx_event->reverted));

                        // The read/write counter differs if we are inserting note hashes or nullifiers
                        auto tree_state = tx_event->prev_tree_state;
                        if (TransactionPhase::NR_NOTE_INSERTION == tx_event->phase ||
                            TransactionPhase::R_NOTE_INSERTION == tx_event->phase) {
                            trace.set(
                                row,
                                handle_pi_read_write(
                                    tx_event->phase, phase_length, phase_counter, tree_state.noteHashTree.counter));
                        } else {
                            trace.set(
                                row,
                                handle_pi_read_write(
                                    tx_event->phase, phase_length, phase_counter, tree_state.nullifierTree.counter));
                        }
                    },
                    [&](const simulation::PrivateEmitL2L1MessageEvent& event) {
                        trace.set(row, handle_l2_l1_msg_event(event, l2_l1_msg_counter, tx_event->reverted));
                        trace.set(
                            row, handle_pi_read_write(tx_event->phase, phase_length, phase_counter, l2_l1_msg_counter));
                        l2_l1_msg_counter++;
                    },
                    [&](const simulation::CollectGasFeeEvent& event) {
                        // TODO: Decide what to read and write
                        trace.set(
                            row,
                            handle_pi_read_write(tx_event->phase, phase_length, phase_counter, /*write_counter=*/0));
                        trace.set(row, handle_collect_gas_fee_event(event));
                    } },
                tx_event->event);

            // Handle a potential phase jump due to a revert, we dont need to check if we are in a revertible phase
            // since our witgen will have exited for any reverts in a non-revertible phase.
            // If we revert in a phase that isnt TEARDOWN, we jump to TEARDOWN
            if (tx_event->reverted && tx_event->phase != TransactionPhase::TEARDOWN) {
                // Jump to the TEARDOWN phase
                // we need to -2 because of the loop increment and because the enum is 1-indexed
                i = static_cast<uint8_t>(TransactionPhase::TEARDOWN) - 2;
            }
            phase_counter++;
        }
        // In case we encounter another skip row
        propagated_tree_state = phase.back()->next_tree_state;
        row++;
    }
}

std::vector<std::unique_ptr<class InteractionBuilderInterface>> TxTraceBuilder::lookup_jobs()
{
    // These are all generic, think which, if any, can be made sequential
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_read_phase_table_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_phase_jump_on_revert_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_read_phase_length_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_read_public_call_request_phase_settings>>(),
        // std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_dispatch_exec_start_settings>>(),
        // std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_dispatch_exec_get_revert_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_read_tree_insert_value_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_write_tree_insert_value_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_read_l2_l1_msg_settings>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_tx_write_l2_l1_msg_settings>>());
}

} // namespace bb::avm2::tracegen
