#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"

#include <cassert>
#include <memory>
#include <unordered_map>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

void NoteHashTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::NoteHashTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    std::unordered_map<size_t, size_t> reverted_in;

    std::vector<size_t> checkpoint_stack;

    for (size_t i = 0; i < events.size(); i++) {
        const auto& event = events[i];

        if (std::holds_alternative<simulation::CheckPointEventType>(event)) {
            switch (std::get<simulation::CheckPointEventType>(event)) {
            case simulation::CheckPointEventType::CREATE_CHECKPOINT:
                checkpoint_stack.push_back(i);
                break;
            case simulation::CheckPointEventType::COMMIT_CHECKPOINT:
                assert(!checkpoint_stack.empty());
                checkpoint_stack.pop_back();
                break;
            case simulation::CheckPointEventType::REVERT_CHECKPOINT:
                assert(!checkpoint_stack.empty());
                reverted_in[checkpoint_stack.back()] = i;
                checkpoint_stack.pop_back();
                break;
            }
        }
    }

    uint32_t row = 0;
    bool discard = false;
    std::optional<size_t> waiting_for_revert = std::nullopt;

    for (size_t i = 0; i < events.size(); i++) {
        const auto& event = events[i];
        if (std::holds_alternative<simulation::CheckPointEventType>(event)) {
            auto check_point_event = std::get<simulation::CheckPointEventType>(event);
            if (check_point_event == simulation::CheckPointEventType::CREATE_CHECKPOINT && reverted_in.contains(i) &&
                !waiting_for_revert.has_value()) {
                waiting_for_revert = reverted_in[i];
                discard = true;
            } else if (check_point_event == simulation::CheckPointEventType::REVERT_CHECKPOINT &&
                       waiting_for_revert.has_value() && waiting_for_revert.value() == i) {
                waiting_for_revert = std::nullopt;
                discard = false;
            }
        } else {
            const auto& read_write_event = std::get<simulation::NoteHashTreeReadWriteEvent>(event);

            bool write = read_write_event.append_data.has_value();

            FF note_hash = read_write_event.note_hash;
            FF siloed_note_hash = read_write_event.note_hash;
            FF unique_note_hash = read_write_event.note_hash;

            bool should_silo = false;
            AztecAddress address = 0;
            FF nonce = 0;

            bool should_unique = false;
            uint64_t note_hash_counter = 0;
            FF next_root = 0;
            FF first_nullifier = 0;
            FF prev_leaf_value = 0;

            if (write) {
                simulation::NoteHashAppendData append_data = read_write_event.append_data.value();
                should_silo = append_data.siloing_data.has_value();
                should_unique = append_data.uniqueness_data.has_value();
                if (should_silo) {
                    siloed_note_hash = append_data.siloing_data->siloed_note_hash;
                    address = append_data.siloing_data->address;
                }
                if (should_unique) {
                    unique_note_hash = append_data.uniqueness_data->unique_note_hash;
                    nonce = append_data.uniqueness_data->nonce;
                    first_nullifier = append_data.uniqueness_data->first_nullifier;
                }
                note_hash_counter = append_data.note_hash_counter;
                next_root = append_data.next_snapshot.root;
            } else {
                prev_leaf_value = unique_note_hash;
            }

            trace.set(row,
                      { { { C::note_hash_tree_check_sel, 1 },
                          { C::note_hash_tree_check_write, write },
                          { C::note_hash_tree_check_note_hash, note_hash },
                          { C::note_hash_tree_check_leaf_index, read_write_event.leaf_index },
                          { C::note_hash_tree_check_prev_root, read_write_event.prev_snapshot.root },
                          { C::note_hash_tree_check_should_silo, should_silo },
                          { C::note_hash_tree_check_address, address },
                          { C::note_hash_tree_check_should_unique, should_unique },
                          { C::note_hash_tree_check_note_hash_index, note_hash_counter },
                          { C::note_hash_tree_check_discard, discard },
                          { C::note_hash_tree_check_next_root, next_root },
                          { C::note_hash_tree_check_siloed_note_hash, siloed_note_hash },
                          { C::note_hash_tree_check_siloing_separator, GENERATOR_INDEX__SILOED_NOTE_HASH },
                          { C::note_hash_tree_check_unique_note_hash, unique_note_hash },
                          { C::note_hash_tree_check_first_nullifier_pi_index,
                            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
                          { C::note_hash_tree_check_first_nullifier, first_nullifier },
                          { C::note_hash_tree_check_nonce, nonce },
                          { C::note_hash_tree_check_nonce_separator, GENERATOR_INDEX__NOTE_HASH_NONCE },
                          { C::note_hash_tree_check_unique_note_hash_separator, GENERATOR_INDEX__UNIQUE_NOTE_HASH },
                          { C::note_hash_tree_check_prev_leaf_value, write ? 0 : unique_note_hash },
                          { C::note_hash_tree_check_next_leaf_value, write ? unique_note_hash : 0 },
                          { C::note_hash_tree_check_note_hash_tree_height, NOTE_HASH_TREE_HEIGHT },
                          { C::note_hash_tree_check_should_write_to_public_inputs, write && (!discard) },
                          { C::note_hash_tree_check_public_inputs_index,
                            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + note_hash_counter } } });
            row++;
        }
    }
}

const InteractionDefinition NoteHashTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_note_hash_tree_check_silo_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_read_first_nullifier_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_nonce_computation_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_unique_note_hash_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_merkle_check_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_write_note_hash_to_public_inputs_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
