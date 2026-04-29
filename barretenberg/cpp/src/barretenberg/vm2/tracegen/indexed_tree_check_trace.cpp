#include "barretenberg/vm2/tracegen/indexed_tree_check_trace.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_indexed_tree_check.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process generic indexed tree check events and populate the relevant columns in the trace.
 *
 * The event stream contains both read/write events and checkpoint events (create, commit, revert).
 * We use process_with_discard to consume the checkpoint events and reconstruct a discard flag for
 * each read/write event, indicating whether it belongs to a reverted checkpoint. Discarded events
 * still produce trace rows but are excluded from public input writes.
 *
 * Each non-checkpoint event produces one trace row covering: siloing, low leaf validation, indexed tree
 * membership checks, low leaf updates, new leaf insertion, and Merkle proofs.
 *
 * @param events The container of indexed tree check events to process.
 * @param trace The trace container to populate with indexed tree check rows.
 */
void IndexedTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::IndexedTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    process_with_discard(events, [&](const simulation::IndexedTreeReadWriteEvent& event, bool raw_discard) {
        FF value = event.value;
        FF siloed_value = event.value;
        FF address = 0;
        FF siloing_separator = 0;

        if (event.siloing_data.has_value()) {
            siloed_value = event.siloing_data->siloed_value;
            address = event.siloing_data->parameters.address;
            siloing_separator = event.siloing_data->parameters.siloing_separator;
        }

        bool exists = event.low_leaf_data.value == siloed_value;
        FF value_low_leaf_value_diff = siloed_value - event.low_leaf_data.value;

        bool next_value_is_nonzero = false;
        FF next_value = 0;
        if (!exists) {
            next_value_is_nonzero = event.low_leaf_data.next_value != 0;
            next_value = event.low_leaf_data.next_value;
        }

        uint64_t updated_low_leaf_next_index = 0;
        FF updated_low_leaf_next_key = 0;
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        FF intermediate_root = 0;

        bool append = event.append_data.has_value();
        if (append) {
            updated_low_leaf_next_key = siloed_value;
            updated_low_leaf_next_index = event.prev_snapshot.next_available_leaf_index;
            updated_low_leaf_hash = event.append_data->updated_low_leaf_hash;
            new_leaf_hash = event.append_data->new_leaf_hash;
            intermediate_root = event.append_data->intermediate_root;
        }

        // Some events do not require writing to public inputs. We always discard those. Lookups by gadgets that don't
        // pass public inputs index should not look up discard.
        bool discard = (!event.public_inputs_index.has_value()) || raw_discard;
        bool sel_write_to_public_inputs = event.append_data.has_value() && (!discard);

        trace.set(row,
                  { {
                      { C::indexed_tree_check_sel, 1 },
                      { C::indexed_tree_check_const_three, 3 },
                      { C::indexed_tree_check_merkle_hash_separator, event.merkle_hash_separator },
                      { C::indexed_tree_check_write, event.write ? 1 : 0 },
                      { C::indexed_tree_check_value, value },
                      { C::indexed_tree_check_root, event.prev_snapshot.root },
                      { C::indexed_tree_check_exists, exists ? 1 : 0 },
                      { C::indexed_tree_check_not_exists, exists ? 0 : 1 },
                      { C::indexed_tree_check_write_root, event.next_snapshot.root },
                      { C::indexed_tree_check_tree_size_before_write, event.prev_snapshot.next_available_leaf_index },
                      { C::indexed_tree_check_tree_size_after_write, event.next_snapshot.next_available_leaf_index },
                      { C::indexed_tree_check_discard, discard ? 1 : 0 },
                      { C::indexed_tree_check_public_inputs_index, event.public_inputs_index.value_or(0) },
                      { C::indexed_tree_check_sel_silo, event.siloing_data.has_value() ? 1 : 0 },
                      { C::indexed_tree_check_address, address },
                      { C::indexed_tree_check_low_leaf_value, event.low_leaf_data.value },
                      { C::indexed_tree_check_low_leaf_next_index, event.low_leaf_data.next_index },
                      { C::indexed_tree_check_low_leaf_next_value, event.low_leaf_data.next_value },
                      { C::indexed_tree_check_updated_low_leaf_next_index, updated_low_leaf_next_index },
                      { C::indexed_tree_check_updated_low_leaf_next_value, updated_low_leaf_next_key },
                      { C::indexed_tree_check_low_leaf_index, event.low_leaf_index },
                      { C::indexed_tree_check_siloed_value, siloed_value },
                      { C::indexed_tree_check_siloing_separator, siloing_separator },
                      { C::indexed_tree_check_sel_insert, append ? 1 : 0 },
                      { C::indexed_tree_check_low_leaf_hash, event.low_leaf_hash },
                      { C::indexed_tree_check_intermediate_root, intermediate_root },
                      { C::indexed_tree_check_updated_low_leaf_hash, updated_low_leaf_hash },
                      { C::indexed_tree_check_tree_height, event.tree_height },
                      { C::indexed_tree_check_value_low_leaf_value_diff_inv,
                        value_low_leaf_value_diff }, // Will be inverted in batch later
                      { C::indexed_tree_check_next_value_is_nonzero, next_value_is_nonzero ? 1 : 0 },
                      { C::indexed_tree_check_next_value_inv, next_value }, // Will be inverted in batch later
                      { C::indexed_tree_check_new_leaf_hash, new_leaf_hash },
                      { C::indexed_tree_check_sel_write_to_public_inputs, sel_write_to_public_inputs ? 1 : 0 },
                  } });
        row++;
    });

    // Batch invert the columns.
    trace.invert_columns(
        { { C::indexed_tree_check_value_low_leaf_value_diff_inv, C::indexed_tree_check_next_value_inv } });
}

const InteractionDefinition IndexedTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupSequential, lookup_indexed_tree_check_silo_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_indexed_tree_check_low_leaf_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_indexed_tree_check_updated_low_leaf_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_indexed_tree_check_low_leaf_merkle_check_settings>()
        .add<InteractionType::LookupGeneric,
             lookup_indexed_tree_check_low_leaf_value_validation_settings>() // ff_gt deduplicates
        .add<InteractionType::LookupGeneric,
             lookup_indexed_tree_check_low_leaf_next_value_validation_settings>() // ff_gt deduplicates
        .add<InteractionType::LookupSequential, lookup_indexed_tree_check_new_leaf_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_indexed_tree_check_new_leaf_merkle_check_settings>()
        .add<InteractionType::LookupIntoIndexedByRow,
             lookup_indexed_tree_check_write_value_to_public_inputs_settings>();

} // namespace bb::avm2::tracegen
