#include "barretenberg/vm2/tracegen/tx_trace.hpp"

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
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

} // namespace

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
std::vector<std::pair<Column, FF>> handle_read_write(TransactionPhase phase,
                                                     uint32_t read_counter,
                                                     uint32_t write_counter)

{
    auto [read_offset, write_offset, length_offset] = TxPhaseOffsetsTable::get().get_offsets(phase);

    return {
        { Column::tx_read_pi_offset, read_offset + read_counter },
        { Column::tx_read_pi_length_offset, length_offset - read_counter },
        { Column::tx_write_pi_offset, write_offset + write_counter },
    };
}

std::vector<std::pair<Column, FF>> handle_public_call_phase(const simulation::PhaseEvent& event)
{
    return { { Column::tx_is_public_call_request, 1 },
             { Column::tx_msg_sender, event.msg_sender },
             { Column::tx_contract_addr, event.contract_address },
             { Column::tx_is_static, event.is_static },
             { Column::tx_calldata_hash, event.calldata_hash },
             { Column::tx_reverted, event.success } };
};

std::vector<std::pair<Column, FF>> handle_append_tree_phase(const simulation::PrivateAppendTreeEvent& event,
                                                            TransactionPhase phase)
{
    return {
        { Column::tx_is_tree_insert_phase, 1 },
        { Column::tx_leaf_value, event.leaf_value },

        // Selectors
        { Column::tx_sel_non_revertible_append_note_hash, phase == TransactionPhase::NR_NOTE_INSERTION },
        { Column::tx_sel_non_revertible_append_nullifier, phase == TransactionPhase::NR_NULLIFIER_INSERTION },
        { Column::tx_sel_revertible_append_note_hash, phase == TransactionPhase::R_NOTE_INSERTION },
        { Column::tx_sel_revertible_append_nullifier, phase == TransactionPhase::R_NULLIFIER_INSERTION },
    };
}

std::vector<std::pair<Column, FF>> handle_l2_l1_msg_phase(const simulation::PrivateEmitL2L1MessageEvent& event,
                                                          uint32_t l2_l1_msg_counter)
{

    return {
        { Column::tx_is_l2_l1_msg_phase, 1 },

        { Column::tx_l2_l1_msg_contract_address, event.scoped_msg.contractAddress },
        { Column::tx_l2_l1_msg_recipient, event.scoped_msg.message.recipient },
        { Column::tx_l2_l1_msg_content, event.scoped_msg.message.content },
        { Column::tx_l2_l1_msg_counter, l2_l1_msg_counter },
    };
}

std::vector<std::pair<Column, FF>> handle_collect_gas_fee_phase(const simulation::CollectGasFeeEvent& event)
{
    return {
        { Column::tx_is_active, 1 },
        { Column::tx_is_collect_fee, 1 },

        // TODO compute fee

        { Column::tx_fee_per_da_gas, event.fee_per_da_gas },
        { Column::tx_fee_per_l2_gas, event.fee_per_l2_gas },
        { Column::tx_max_fee_per_da_gas, event.max_fee_per_da_gas },
        { Column::tx_max_fee_per_l2_gas, event.max_fee_per_l2_gas },
        { Column::tx_max_priority_fees_per_l2_gas, event.max_priority_fees_per_l2_gas },
        { Column::tx_max_priority_fees_per_da_gas, event.max_priority_fees_per_da_gas },
    };
}

void TxTraceBuilder::process(const simulation::EventEmitterInterface<simulation::TxEvent>::Container& events,
                             TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Shifts

    // A nuance of the tracegen for the tx trace is that if there are no events in a phase, we still need to emit a row
    // for this "skipped "row. This row is needed to simplify the circuit constraints and ensure that we have continuity
    // in the tree state propagation

    // We bucket the events by phase to make it easier to detect phases with no events
    std::array<std::vector<simulation::TxEvent>, NUM_PHASES> phase_array = {};
    for (const auto& tx_event : events) {
        phase_array[static_cast<uint8_t>(tx_event.phase)].push_back(tx_event);
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
    for (uint32_t i = 0; i < phase_array.size(); i++) {
        const auto& phase = phase_array[i];
        if (phase.empty()) {
            trace.set(row, insert_tree_state(propagated_tree_state, propagated_tree_state));
            trace.set(row, { { { C::tx_phase_value, i }, { C::tx_is_active, 0 } } });
            row++;
            continue;
        }
        // We have events to process in this phase
        for (const auto& tx_event : phase) {
            // Count the number of steps in this phase
            uint32_t phase_counter = 0;
            // We alway set the tree state
            trace.set(row, insert_tree_state(tx_event.prev_tree_state, tx_event.next_tree_state));
            trace.set(row, { { { C::tx_phase_value, static_cast<uint8_t>(tx_event.phase) }, { C::tx_is_active, 1 } } });

            std::visit(
                overloaded{
                    [&](const simulation::PhaseEvent& event) {
                        trace.set(row, handle_public_call_phase(event));
                        // No explicit write counter for this phase
                        trace.set(row, handle_read_write(tx_event.phase, phase_counter, /*write_counter=*/0));
                    },
                    [&](const simulation::PrivateAppendTreeEvent& event) {
                        trace.set(row, handle_append_tree_phase(event, tx_event.phase));

                        // The read/write counter differs if we are inserting note hashes or nullifiers
                        auto tree_state = tx_event.next_tree_state;
                        if (TransactionPhase::NR_NOTE_INSERTION == tx_event.phase ||
                            TransactionPhase::R_NOTE_INSERTION == tx_event.phase) {
                            trace.set(
                                row, handle_read_write(tx_event.phase, phase_counter, tree_state.noteHashTree.counter));
                        } else {
                            trace.set(
                                row,
                                handle_read_write(tx_event.phase, phase_counter, tree_state.nullifierTree.counter));
                        }
                    },
                    [&](const simulation::PrivateEmitL2L1MessageEvent& event) {
                        trace.set(row, handle_l2_l1_msg_phase(event, l2_l1_msg_counter));
                        trace.set(row, handle_read_write(tx_event.phase, phase_counter, l2_l1_msg_counter));
                        l2_l1_msg_counter++;
                    },
                    [&](const simulation::CollectGasFeeEvent& event) {
                        // TODO: Decide what to read and write
                        trace.set(row, handle_collect_gas_fee_phase(event));
                    } },
                tx_event.event);
            phase_counter++;
        }
        // In case we encounter another skip row
        propagated_tree_state = phase.back().next_tree_state;
        row++;
    }
}
} // namespace bb::avm2::tracegen
