#include "barretenberg/vm2/tracegen/public_data_tree_read_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_read.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

void PublicDataTreeReadTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::PublicDataTreeReadEvent>::Container& events,
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

        trace.set(row,
                  { { { C::public_data_read_sel, 1 },
                      { C::public_data_read_value, event.value },
                      { C::public_data_read_slot, event.slot },
                      { C::public_data_read_root, event.root },
                      { C::public_data_read_low_leaf_slot, event.low_leaf_preimage.leaf.slot },
                      { C::public_data_read_low_leaf_value, event.low_leaf_preimage.leaf.value },
                      { C::public_data_read_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                      { C::public_data_read_low_leaf_next_slot, event.low_leaf_preimage.nextKey },
                      { C::public_data_read_low_leaf_index, event.low_leaf_index },
                      { C::public_data_read_low_leaf_hash, event.low_leaf_hash },
                      { C::public_data_read_tree_height, PUBLIC_DATA_TREE_HEIGHT },
                      { C::public_data_read_leaf_not_exists, !exists },
                      { C::public_data_read_slot_low_leaf_slot_diff_inv, slot_low_leaf_slot_diff_inv },
                      { C::public_data_read_one, 1 },
                      { C::public_data_read_next_slot_is_nonzero, next_slot_is_nonzero },
                      { C::public_data_read_next_slot_inv, next_slot_inv } } });
        row++;
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> PublicDataTreeReadTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_read_low_leaf_poseidon2_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_read_low_leaf_poseidon2_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_read_low_leaf_membership_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_public_data_read_low_leaf_slot_validation_settings>>(),
        std::make_unique<
            LookupIntoDynamicTableSequential<lookup_public_data_read_low_leaf_next_slot_validation_settings>>());
}

} // namespace bb::avm2::tracegen
