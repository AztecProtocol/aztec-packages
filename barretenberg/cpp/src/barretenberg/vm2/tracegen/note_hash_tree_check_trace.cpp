#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"

#include <cassert>
#include <memory>
#include <stack>
#include <unordered_map>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

void NoteHashTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::NoteHashTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    process_with_discard(events, [&](const simulation::NoteHashTreeReadWriteEvent& event, bool discard) {
        bool write = event.append_data.has_value();

        FF note_hash = event.note_hash;
        FF siloed_note_hash = event.note_hash;
        FF unique_note_hash = event.note_hash;

        bool should_silo = false;
        AztecAddress address = 0;
        FF nonce = 0;

        bool should_unique = false;
        uint64_t note_hash_counter = 0;
        FF next_root = 0;
        FF first_nullifier = 0;

        if (write) {
            simulation::NoteHashAppendData append_data = event.append_data.value();
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
        }

        FF prev_leaf_value = event.existing_leaf_value;
        bool exists = prev_leaf_value == unique_note_hash;
        FF prev_leaf_value_unique_note_hash_diff_inv = exists ? 0 : (prev_leaf_value - unique_note_hash).invert();

        trace.set(row,
                  { { { C::note_hash_tree_check_sel, 1 },
                      { C::note_hash_tree_check_write, write },
                      { C::note_hash_tree_check_exists, exists },
                      { C::note_hash_tree_check_note_hash, note_hash },
                      { C::note_hash_tree_check_leaf_index, event.leaf_index },
                      { C::note_hash_tree_check_prev_root, event.prev_snapshot.root },
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
                      { C::note_hash_tree_check_prev_leaf_value, prev_leaf_value },
                      { C::note_hash_tree_check_prev_leaf_value_unique_note_hash_diff_inv,
                        prev_leaf_value_unique_note_hash_diff_inv },
                      { C::note_hash_tree_check_next_leaf_value, write ? unique_note_hash : 0 },
                      { C::note_hash_tree_check_note_hash_tree_height, NOTE_HASH_TREE_HEIGHT },
                      { C::note_hash_tree_check_should_write_to_public_inputs, write && (!discard) },
                      { C::note_hash_tree_check_public_inputs_index,
                        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + note_hash_counter } } });
        row++;
    });
}

const InteractionDefinition NoteHashTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_note_hash_tree_check_silo_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_read_first_nullifier_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_nonce_computation_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_unique_note_hash_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_merkle_check_settings, InteractionType::LookupGeneric>()
        .add<lookup_note_hash_tree_check_write_note_hash_to_public_inputs_settings,
             InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
