#include "barretenberg/vm2/tracegen/public_data_tree_check_trace.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_check.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

using simulation::PublicDataTreeLeafPreimage;

void PublicDataTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::PublicDataTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;

    for (const auto& event : events) {
        bool exists = event.low_leaf_preimage.leaf.slot == event.slot;
        FF slot_low_leaf_slot_diff_inv = exists ? 0 : (event.slot - event.low_leaf_preimage.leaf.slot).invert();

        bool next_slot_is_nonzero = false;
        FF next_slot_inv = 0;
        if (!exists) {
            next_slot_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_slot_inv = next_slot_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        bool write = event.write_data.has_value();
        bool should_insert = !exists && write;

        FF intermediate_root = 0;
        FF write_root = 0;
        PublicDataTreeLeafPreimage updated_low_leaf = PublicDataTreeLeafPreimage::empty();
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        if (write) {
            write_root = event.write_data->next_snapshot.root;
            intermediate_root = event.write_data->intermediate_root;
            updated_low_leaf = event.write_data->updated_low_leaf_preimage;
            updated_low_leaf_hash = event.write_data->updated_low_leaf_hash;
            new_leaf_hash = event.write_data->new_leaf_hash;
        }

        trace.set(row,
                  { {
                      { C::public_data_check_sel, 1 },
                      { C::public_data_check_value, event.value },
                      { C::public_data_check_slot, event.slot },
                      { C::public_data_check_root, event.prev_snapshot.root },
                      { C::public_data_check_write_root, write_root },
                      { C::public_data_check_tree_size_before_write, event.prev_snapshot.nextAvailableLeafIndex },
                      { C::public_data_check_write, write },
                      { C::public_data_check_low_leaf_slot, event.low_leaf_preimage.leaf.slot },
                      { C::public_data_check_low_leaf_value, event.low_leaf_preimage.leaf.value },
                      { C::public_data_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                      { C::public_data_check_low_leaf_next_slot, event.low_leaf_preimage.nextKey },
                      { C::public_data_check_updated_low_leaf_value, updated_low_leaf.leaf.value },
                      { C::public_data_check_updated_low_leaf_next_index, updated_low_leaf.nextIndex },
                      { C::public_data_check_updated_low_leaf_next_slot, updated_low_leaf.nextKey },
                      { C::public_data_check_low_leaf_index, event.low_leaf_index },
                      { C::public_data_check_leaf_not_exists, !exists },
                      { C::public_data_check_slot_low_leaf_slot_diff_inv, slot_low_leaf_slot_diff_inv },
                      { C::public_data_check_one, 1 },
                      { C::public_data_check_next_slot_is_nonzero, next_slot_is_nonzero },
                      { C::public_data_check_next_slot_inv, next_slot_inv },
                      { C::public_data_check_low_leaf_hash, event.low_leaf_hash },
                      { C::public_data_check_intermediate_root, intermediate_root },
                      { C::public_data_check_tree_height, PUBLIC_DATA_TREE_HEIGHT },
                      { C::public_data_check_updated_low_leaf_hash, updated_low_leaf_hash },
                      { C::public_data_check_should_insert, should_insert },
                      { C::public_data_check_new_leaf_hash, new_leaf_hash },
                  } });
        row++;
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> PublicDataTreeCheckTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        // Public data read/write
        std::make_unique<
            LookupIntoDynamicTableSequential<lookup_public_data_check_low_leaf_slot_validation_settings>>(),
        std::make_unique<
            LookupIntoDynamicTableSequential<lookup_public_data_check_low_leaf_next_slot_validation_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_check_low_leaf_poseidon2_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_check_low_leaf_poseidon2_1_settings>>(),
        std::make_unique<
            LookupIntoDynamicTableSequential<lookup_public_data_check_updated_low_leaf_poseidon2_0_settings>>(),
        std::make_unique<
            LookupIntoDynamicTableSequential<lookup_public_data_check_updated_low_leaf_poseidon2_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_check_low_leaf_merkle_check_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_check_new_leaf_poseidon2_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_check_new_leaf_poseidon2_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_check_new_leaf_merkle_check_settings>>());
}

} // namespace bb::avm2::tracegen
