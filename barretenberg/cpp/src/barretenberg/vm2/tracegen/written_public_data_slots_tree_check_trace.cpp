#include "barretenberg/vm2/tracegen/written_public_data_slots_tree_check_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void WrittenPublicDataSlotsTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::WrittenPublicDataSlotsTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        FF slot = event.slot;
        FF leaf_slot = event.leaf_slot;
        FF address = event.contract_address;

        bool exists = event.low_leaf_preimage.leaf.slot == leaf_slot;
        FF slot_low_leaf_slot_diff_inv = exists ? 0 : (leaf_slot - event.low_leaf_preimage.leaf.slot).invert();

        bool next_slot_is_nonzero = false;
        FF next_slot_inv = 0;
        if (!exists) {
            next_slot_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_slot_inv = next_slot_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        uint64_t updated_low_leaf_next_index = 0;
        FF updated_low_leaf_next_key = 0;
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        FF intermediate_root = 0;

        bool append = event.append_data.has_value();
        if (append) {
            updated_low_leaf_next_key = leaf_slot;
            updated_low_leaf_next_index = event.prev_snapshot.nextAvailableLeafIndex;
            updated_low_leaf_hash = event.append_data->updated_low_leaf_hash;
            new_leaf_hash = event.append_data->new_leaf_hash;
            intermediate_root = event.append_data->intermediate_root;
        }

        trace.set(
            row,
            { {
                { C::written_public_data_slots_tree_check_sel, 1 },
                { C::written_public_data_slots_tree_check_write, event.write },
                { C::written_public_data_slots_tree_check_slot, slot },
                { C::written_public_data_slots_tree_check_root, event.prev_snapshot.root },
                { C::written_public_data_slots_tree_check_exists, exists },
                { C::written_public_data_slots_tree_check_write_root, event.next_snapshot.root },
                { C::written_public_data_slots_tree_check_tree_size_before_write,
                  event.prev_snapshot.nextAvailableLeafIndex },
                { C::written_public_data_slots_tree_check_tree_size_after_write,
                  event.next_snapshot.nextAvailableLeafIndex },
                { C::written_public_data_slots_tree_check_address, address },
                { C::written_public_data_slots_tree_check_low_leaf_slot, event.low_leaf_preimage.leaf.slot },
                { C::written_public_data_slots_tree_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                { C::written_public_data_slots_tree_check_low_leaf_next_slot, event.low_leaf_preimage.nextKey },
                { C::written_public_data_slots_tree_check_updated_low_leaf_next_index, updated_low_leaf_next_index },
                { C::written_public_data_slots_tree_check_updated_low_leaf_next_slot, updated_low_leaf_next_key },
                { C::written_public_data_slots_tree_check_low_leaf_index, event.low_leaf_index },
                { C::written_public_data_slots_tree_check_leaf_slot, leaf_slot },
                { C::written_public_data_slots_tree_check_siloing_separator, GENERATOR_INDEX__PUBLIC_LEAF_INDEX },
                { C::written_public_data_slots_tree_check_should_insert, append },
                { C::written_public_data_slots_tree_check_low_leaf_hash, event.low_leaf_hash },
                { C::written_public_data_slots_tree_check_intermediate_root, intermediate_root },
                { C::written_public_data_slots_tree_check_updated_low_leaf_hash, updated_low_leaf_hash },
                { C::written_public_data_slots_tree_check_tree_height, AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT },
                { C::written_public_data_slots_tree_check_leaf_not_exists, !exists },
                { C::written_public_data_slots_tree_check_slot_low_leaf_slot_diff_inv, slot_low_leaf_slot_diff_inv },
                { C::written_public_data_slots_tree_check_next_slot_is_nonzero, next_slot_is_nonzero },
                { C::written_public_data_slots_tree_check_next_slot_inv, next_slot_inv },
                { C::written_public_data_slots_tree_check_new_leaf_hash, new_leaf_hash },
            } });
        row++;
    }
}

const InteractionDefinition WrittenPublicDataSlotsTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_written_public_data_slots_tree_check_silo_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_settings,
             InteractionType::LookupGeneric>();
;

} // namespace bb::avm2::tracegen
