#include "barretenberg/vm2/tracegen/retrieved_bytecodes_tree_check.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void RetrievedBytecodesTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::RetrievedBytecodesTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        FF class_id = event.class_id;

        bool exists = event.low_leaf_preimage.leaf.class_id == class_id;
        FF class_id_low_leaf_class_id_diff_inv =
            exists ? 0 : (class_id - event.low_leaf_preimage.leaf.class_id).invert();

        bool next_class_id_is_nonzero = false;
        FF next_class_id_inv = 0;
        if (!exists) {
            next_class_id_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_class_id_inv = next_class_id_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        uint64_t updated_low_leaf_next_index = 0;
        FF updated_low_leaf_next_key = 0;
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        FF intermediate_root = 0;

        bool append = event.append_data.has_value();
        if (append) {
            updated_low_leaf_next_key = class_id;
            updated_low_leaf_next_index = event.prev_snapshot.nextAvailableLeafIndex;
            updated_low_leaf_hash = event.append_data->updated_low_leaf_hash;
            new_leaf_hash = event.append_data->new_leaf_hash;
            intermediate_root = event.append_data->intermediate_root;
        }

        trace.set(
            row,
            { {
                { C::retrieved_bytecodes_tree_check_sel, 1 },
                { C::retrieved_bytecodes_tree_check_write, event.write },
                { C::retrieved_bytecodes_tree_check_class_id, class_id },
                { C::retrieved_bytecodes_tree_check_root, event.prev_snapshot.root },
                { C::retrieved_bytecodes_tree_check_write_root, event.next_snapshot.root },
                { C::retrieved_bytecodes_tree_check_tree_size_before_write,
                  event.prev_snapshot.nextAvailableLeafIndex },
                { C::retrieved_bytecodes_tree_check_tree_size_after_write, event.next_snapshot.nextAvailableLeafIndex },
                { C::retrieved_bytecodes_tree_check_low_leaf_class_id, event.low_leaf_preimage.leaf.class_id },
                { C::retrieved_bytecodes_tree_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                { C::retrieved_bytecodes_tree_check_low_leaf_next_class_id, event.low_leaf_preimage.nextKey },
                { C::retrieved_bytecodes_tree_check_updated_low_leaf_next_index, updated_low_leaf_next_index },
                { C::retrieved_bytecodes_tree_check_updated_low_leaf_next_class_id, updated_low_leaf_next_key },
                { C::retrieved_bytecodes_tree_check_low_leaf_index, event.low_leaf_index },
                { C::retrieved_bytecodes_tree_check_should_insert, append },
                { C::retrieved_bytecodes_tree_check_low_leaf_hash, event.low_leaf_hash },
                { C::retrieved_bytecodes_tree_check_intermediate_root, intermediate_root },
                { C::retrieved_bytecodes_tree_check_updated_low_leaf_hash, updated_low_leaf_hash },
                { C::retrieved_bytecodes_tree_check_tree_height, AVM_RETRIEVED_BYTECODES_TREE_HEIGHT },
                { C::retrieved_bytecodes_tree_check_leaf_not_exists, !exists },
                { C::retrieved_bytecodes_tree_check_class_id_low_leaf_class_id_diff_inv,
                  class_id_low_leaf_class_id_diff_inv },
                { C::retrieved_bytecodes_tree_check_next_class_id_is_nonzero, next_class_id_is_nonzero },
                { C::retrieved_bytecodes_tree_check_next_class_id_inv, next_class_id_inv },
                { C::retrieved_bytecodes_tree_check_new_leaf_hash, new_leaf_hash },
            } });
        row++;
    }
}

const InteractionDefinition RetrievedBytecodesTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_retrieved_bytecodes_tree_check_low_leaf_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_retrieved_bytecodes_tree_check_updated_low_leaf_poseidon2_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_retrieved_bytecodes_tree_check_low_leaf_merkle_check_settings, InteractionType::LookupGeneric>()
        .add<lookup_retrieved_bytecodes_tree_check_low_leaf_class_id_validation_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_retrieved_bytecodes_tree_check_low_leaf_next_class_id_validation_settings,
             InteractionType::LookupGeneric>()
        .add<lookup_retrieved_bytecodes_tree_check_new_leaf_poseidon2_settings, InteractionType::LookupGeneric>()
        .add<lookup_retrieved_bytecodes_tree_check_new_leaf_merkle_check_settings, InteractionType::LookupGeneric>();
;

} // namespace bb::avm2::tracegen
