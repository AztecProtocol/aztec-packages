#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_check.hpp"
#include "barretenberg/vm2/generated/relations/lookups_update_check.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using simulation::NullifierTreeLeafPreimage;

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
        FF nullifier_low_leaf_nullifier_diff_inv =
            exists ? 0 : (siloed_nullifier - event.low_leaf_preimage.leaf.nullifier).invert();

        bool next_nullifier_is_nonzero = false;
        FF next_nullifier_inv = 0;
        if (!exists) {
            next_nullifier_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_nullifier_inv = next_nullifier_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        uint64_t updated_low_leaf_next_index = 0;
        FF updated_low_leaf_next_key = 0;
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        FF intermediate_root = 0;

        bool append = event.append_data.has_value();
        if (append) {
            updated_low_leaf_next_key = siloed_nullifier;
            updated_low_leaf_next_index = event.prev_snapshot.nextAvailableLeafIndex;
            updated_low_leaf_hash = event.append_data->updated_low_leaf_hash;
            new_leaf_hash = event.append_data->new_leaf_hash;
            intermediate_root = event.append_data->intermediate_root;
        }

        trace.set(
            row,
            { { { C::nullifier_check_sel, 1 },
                { C::nullifier_check_write, event.write },
                { C::nullifier_check_nullifier, nullifier },
                { C::nullifier_check_root, event.prev_snapshot.root },
                { C::nullifier_check_exists, exists },
                { C::nullifier_check_write_root, event.next_snapshot.root },
                { C::nullifier_check_tree_size_before_write, event.prev_snapshot.nextAvailableLeafIndex },
                { C::nullifier_check_discard, discard },
                { C::nullifier_check_nullifier_index, event.nullifier_counter },
                { C::nullifier_check_should_silo, event.siloing_data.has_value() },
                { C::nullifier_check_address, address },
                { C::nullifier_check_low_leaf_nullifier, event.low_leaf_preimage.leaf.nullifier },
                { C::nullifier_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                { C::nullifier_check_low_leaf_next_nullifier, event.low_leaf_preimage.nextKey },
                { C::nullifier_check_updated_low_leaf_next_index, updated_low_leaf_next_index },
                { C::nullifier_check_updated_low_leaf_next_nullifier, updated_low_leaf_next_key },
                { C::nullifier_check_low_leaf_index, event.low_leaf_index },
                { C::nullifier_check_siloed_nullifier, siloed_nullifier },
                { C::nullifier_check_siloing_separator, GENERATOR_INDEX__OUTER_NULLIFIER },
                { C::nullifier_check_should_insert, append },
                { C::nullifier_check_low_leaf_hash, event.low_leaf_hash },
                { C::nullifier_check_intermediate_root, intermediate_root },
                { C::nullifier_check_updated_low_leaf_hash, updated_low_leaf_hash },
                { C::nullifier_check_tree_height, NULLIFIER_TREE_HEIGHT },
                { C::nullifier_check_leaf_not_exists, !exists },
                { C::nullifier_check_nullifier_low_leaf_nullifier_diff_inv, nullifier_low_leaf_nullifier_diff_inv },
                { C::nullifier_check_next_nullifier_is_nonzero, next_nullifier_is_nonzero },
                { C::nullifier_check_next_nullifier_inv, next_nullifier_inv },
                { C::nullifier_check_new_leaf_hash, new_leaf_hash },
                { C::nullifier_check_should_write_to_public_inputs, event.append_data.has_value() && !discard },
                { C::nullifier_check_public_inputs_index,
                  AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + event.nullifier_counter } } });
        row++;
    });
}

const InteractionDefinition NullifierTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_nullifier_check_silo_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_updated_low_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_nullifier_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_next_nullifier_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_new_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_new_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_write_nullifier_to_public_inputs_settings,
             InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
