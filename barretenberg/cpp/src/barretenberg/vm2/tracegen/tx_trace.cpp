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

} // namespace

std::vector<std::pair<Column, FF>> handle_public_call_phase(const simulation::PhaseEvent& event, uint32_t phase_counter)
{
    auto [read_offset, write_offset, length_offset] = TxPhaseOffsetsTable::get().get_offsets(event.phase);
    auto tree_state = event.tree_state;

    return {
        { Column::tx_phase_value, static_cast<uint8_t>(event.phase) },
        { Column::tx_is_public_call_request, 1 },

        { Column::tx_msg_sender, event.msg_sender },
        { Column::tx_contract_addr, event.contract_address },
        { Column::tx_is_static, event.is_static },
        { Column::tx_calldata_hash, event.calldata_hash },
        { Column::tx_reverted, event.success },

        { Column::tx_read_pi_offset, read_offset + phase_counter },
        { Column::tx_read_pi_length_offset, length_offset + phase_counter },
        { Column::tx_write_pi_offset, write_offset },

        // Tree State
        // Note Hash / Nullifier Tree Roots
        { Column::tx_note_hash_tree_root, tree_state.noteHashTree.tree.root },
        { Column::tx_note_hash_tree_size, tree_state.noteHashTree.tree.nextAvailableLeafIndex },
        { Column::tx_num_note_hashes_emitted, tree_state.noteHashTree.counter },

        { Column::tx_nullifier_tree_root, tree_state.nullifierTree.tree.root },
        { Column::tx_nullifier_tree_size, tree_state.nullifierTree.tree.nextAvailableLeafIndex },
        { Column::tx_num_nullifiers_emitted, tree_state.nullifierTree.counter },
    };
};

std::vector<std::pair<Column, FF>> handle_append_tree_phase(const simulation::PrivateAppendTreeEvent& event,
                                                            uint32_t phase_counter)
{
    auto [read_offset, write_offset, length_offset] = TxPhaseOffsetsTable::get().get_offsets(event.phase);
    auto tree_state = event.tree_state;

    // Extract counter based on what the phase is - this is so inelegant
    uint32_t counter = 0;
    switch (event.phase) {
    case TransactionPhase::NR_NOTE_INSERTION:
    case TransactionPhase::R_NOTE_INSERTION:
        counter = tree_state.noteHashTree.counter;
        break;
    case TransactionPhase::NR_NULLIFIER_INSERTION:
    case TransactionPhase::R_NULLIFIER_INSERTION:
        counter = tree_state.nullifierTree.counter;
        break;
    default:
        // We should never get here because of the variant type in the parameters
        break;
    }

    return {
        { Column::tx_phase_value, static_cast<uint8_t>(event.phase) },
        { Column::tx_is_tree_insert_phase, 1 },
        { Column::tx_leaf_value, event.leaf_value },

        // Read / Write
        { Column::tx_read_pi_offset, read_offset + phase_counter },          // Add length counter
        { Column::tx_read_pi_length_offset, length_offset - phase_counter }, // Subtract  by length counter
        { Column::tx_write_pi_offset, write_offset + counter },

        // Selectors
        { Column::tx_sel_non_revertible_append_note_hash, event.phase == TransactionPhase::NR_NOTE_INSERTION },
        { Column::tx_sel_non_revertible_append_nullifier, event.phase == TransactionPhase::NR_NULLIFIER_INSERTION },
        { Column::tx_sel_revertible_append_note_hash, event.phase == TransactionPhase::R_NOTE_INSERTION },
        { Column::tx_sel_revertible_append_nullifier, event.phase == TransactionPhase::R_NULLIFIER_INSERTION },

        // Note Hash / Nullifier Tree Roots
        { Column::tx_note_hash_tree_root, tree_state.noteHashTree.tree.root },
        { Column::tx_note_hash_tree_size, tree_state.noteHashTree.tree.nextAvailableLeafIndex },
        { Column::tx_num_note_hashes_emitted, tree_state.noteHashTree.counter },

        { Column::tx_nullifier_tree_root, tree_state.nullifierTree.tree.root },
        { Column::tx_nullifier_tree_size, tree_state.nullifierTree.tree.nextAvailableLeafIndex },
        { Column::tx_num_nullifiers_emitted, tree_state.nullifierTree.counter },
    };
}

void TxTraceBuilder::process(const simulation::EventEmitterInterface<simulation::TxEvent>::Container& events,
                             TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Shifts
    uint32_t phase_counter = 0;
    uint32_t l2_l1_msg_counter = 0;

    TransactionPhase last_phase = TransactionPhase::NR_NOTE_INSERTION;
    for (const auto& event : events) {
        // By default propagate a bunch of columns (e.g. tree state), if they need to be updated, the visitor will
        // do it
        std::visit(
            overloaded{ [&](const simulation::PhaseEvent& event) {
                           phase_counter = event.phase != last_phase ? 0 : phase_counter + 1;
                           trace.set(row, handle_public_call_phase(event, phase_counter));
                           last_phase = event.phase;
                       },
                        [&](const simulation::PrivateAppendTreeEvent& event) {
                            phase_counter = event.phase != last_phase ? 0 : phase_counter + 1;
                            trace.set(row, handle_append_tree_phase(event, phase_counter));
                            last_phase = event.phase;
                        },
                        [&](const simulation::PrivateEmitL2L1MessageEvent& event) {
                            phase_counter = event.phase != last_phase ? 0 : phase_counter + 1;
                            trace.set(row,
                                      { {
                                          { C::tx_phase_value, static_cast<uint8_t>(event.phase) },
                                          { C::tx_is_l2_l1_msg_phase, 1 },
                                          { C::tx_l2_l1_msg_contract_address, event.scoped_msg.contractAddress },
                                          { C::tx_l2_l1_msg_recipient, event.scoped_msg.message.recipient },
                                          { C::tx_l2_l1_msg_content, event.scoped_msg.message.content },
                                          { C::tx_l2_l1_msg_counter, l2_l1_msg_counter },
                                      } });
                            l2_l1_msg_counter++;
                            last_phase = event.phase;
                        },
                        [&](const simulation::CollectGasFeeEvent& event) {
                            trace.set(
                                row,
                                { {
                                    { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES) },

                                    { C::tx_is_collect_fee, 1 },
                                    { C::tx_fee_per_da_gas, event.fee_per_da_gas },
                                    { C::tx_fee_per_l2_gas, event.fee_per_l2_gas },

                                    { C::tx_max_fee_per_da_gas, event.max_fee_per_da_gas },
                                    { C::tx_max_fee_per_l2_gas, event.max_fee_per_l2_gas },

                                    { C::tx_max_priority_fees_per_l2_gas, event.max_priority_fees_per_l2_gas },
                                    { C::tx_max_priority_fees_per_da_gas, event.max_priority_fees_per_da_gas },
                                } });
                        } },
            event);
        row++;
    }

    // we think of a better way to handle this in circuit and can remove this step
}
} // namespace bb::avm2::tracegen
