#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_check.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"

namespace bb::avm2::tracegen {

using simulation::NullifierTreeLeafPreimage;

/**
 * @brief Process the nullifier tree check events and populate the relevant columns in the trace.
 *
 * The event stream contains both read/write events and checkpoint events (create, commit, revert).
 * We use process_with_discard to consume the checkpoint events and reconstruct a discard flag for
 * each read/write event, indicating whether it belongs to a reverted checkpoint. Discarded events
 * still produce trace rows but are excluded from public input writes.
 *
 * Each non-checkpoint event produces one trace row covering: siloing, low leaf validation, indexed tree
 * membership checks, low leaf updates, new leaf insertion, and Merkle proofs.
 *
 * @param events The container of nullifier tree check events to process.
 * @param trace The trace container to populate with nullifier tree check rows.
 */
void NullifierTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::NullifierTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    process_with_discard(events, [&](const simulation::NullifierTreeReadWriteEvent& event, bool discard) {
        FF nullifier = event.nullifier;
        FF siloed_nullifier = event.nullifier;
        FF address = 0;

        if (event.siloing_data.has_value()) {
            siloed_nullifier = event.siloing_data->siloed_nullifier;
            address = event.siloing_data->address;
        }

        bool exists = event.low_leaf_preimage.leaf.nullifier == siloed_nullifier;
        FF nullifier_low_leaf_nullifier_diff = siloed_nullifier - event.low_leaf_preimage.leaf.nullifier;

        bool next_nullifier_is_nonzero = false;
        FF next_nullifier = 0;
        if (!exists) {
            next_nullifier_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_nullifier = event.low_leaf_preimage.nextKey;
        }

        uint64_t updated_low_leaf_next_index = 0;
        FF updated_low_leaf_next_key = 0;
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        FF intermediate_root = 0;

        bool append = event.append_data.has_value();
        if (append) {
            updated_low_leaf_next_key = siloed_nullifier;
            updated_low_leaf_next_index = event.prev_snapshot.next_available_leaf_index;
            updated_low_leaf_hash = event.append_data->updated_low_leaf_hash;
            new_leaf_hash = event.append_data->new_leaf_hash;
            intermediate_root = event.append_data->intermediate_root;
        }

        trace.set(
            row,
            { { { C::nullifier_check_sel, 1 },
                { C::nullifier_check_const_three, 3 },
                { C::nullifier_check_write, event.write ? 1 : 0 },
                { C::nullifier_check_nullifier, nullifier },
                { C::nullifier_check_root, event.prev_snapshot.root },
                { C::nullifier_check_exists, exists ? 1 : 0 },
                { C::nullifier_check_write_root, event.next_snapshot.root },
                { C::nullifier_check_tree_size_before_write, event.prev_snapshot.next_available_leaf_index },
                { C::nullifier_check_discard, discard ? 1 : 0 },
                { C::nullifier_check_nullifier_index, event.nullifier_counter },
                { C::nullifier_check_sel_silo, event.siloing_data.has_value() ? 1 : 0 },
                { C::nullifier_check_address, address },
                { C::nullifier_check_low_leaf_nullifier, event.low_leaf_preimage.leaf.nullifier },
                { C::nullifier_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                { C::nullifier_check_low_leaf_next_nullifier, event.low_leaf_preimage.nextKey },
                { C::nullifier_check_updated_low_leaf_next_index, updated_low_leaf_next_index },
                { C::nullifier_check_updated_low_leaf_next_nullifier, updated_low_leaf_next_key },
                { C::nullifier_check_low_leaf_index, event.low_leaf_index },
                { C::nullifier_check_siloed_nullifier, siloed_nullifier },
                { C::nullifier_check_siloing_separator, DOM_SEP__SILOED_NULLIFIER },
                { C::nullifier_check_sel_insert, append ? 1 : 0 },
                { C::nullifier_check_low_leaf_hash, event.low_leaf_hash },
                { C::nullifier_check_intermediate_root, intermediate_root },
                { C::nullifier_check_updated_low_leaf_hash, updated_low_leaf_hash },
                { C::nullifier_check_tree_height, NULLIFIER_TREE_HEIGHT },
                { C::nullifier_check_leaf_not_exists, exists ? 0 : 1 },
                { C::nullifier_check_nullifier_low_leaf_nullifier_diff_inv,
                  nullifier_low_leaf_nullifier_diff }, // Will be inverted in batch later
                { C::nullifier_check_next_nullifier_is_nonzero, next_nullifier_is_nonzero ? 1 : 0 },
                { C::nullifier_check_next_nullifier_inv, next_nullifier }, // Will be inverted in batch later
                { C::nullifier_check_new_leaf_hash, new_leaf_hash },
                { C::nullifier_check_sel_write_to_public_inputs, (event.append_data.has_value() && !discard) ? 1 : 0 },
                { C::nullifier_check_public_inputs_index,
                  AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + event.nullifier_counter } } });
        row++;
    });

    // Batch invert the columns.
    trace.invert_columns(
        { { C::nullifier_check_nullifier_low_leaf_nullifier_diff_inv, C::nullifier_check_next_nullifier_inv } });
}

const InteractionDefinition NullifierTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_nullifier_check_silo_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_updated_low_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_nullifier_validation_settings,
             InteractionType::LookupGeneric>() // ff_gt deduplicates
        .add<lookup_nullifier_check_low_leaf_next_nullifier_validation_settings,
             InteractionType::LookupGeneric>() // ff_gt deduplicates
        .add<lookup_nullifier_check_new_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_new_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_write_nullifier_to_public_inputs_settings,
             InteractionType::LookupIntoIndexedByRow>();

} // namespace bb::avm2::tracegen
