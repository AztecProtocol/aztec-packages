#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"

#include "barretenberg/vm2/common/constants.hpp"
#include <stdexcept>

namespace bb::avm2::simulation {

void PublicDataTreeCheck::assert_read(const FF& leaf_slot,
                                      const FF& value,
                                      const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                      uint64_t low_leaf_index,
                                      std::span<const FF> sibling_path,
                                      const FF& root)
{
    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, root);

    // Low leaf and value validation
    bool exists = low_leaf_preimage.leaf.slot == leaf_slot;
    if (exists) {
        if (low_leaf_preimage.leaf.value != value) {
            throw std::runtime_error("Leaf value does not match value");
        }
    } else {
        if (!field_gt.ff_gt(leaf_slot, low_leaf_preimage.leaf.slot)) {
            throw std::runtime_error("Low leaf slot is GTE leaf slot");
        }
        // indexed_leaf calls nextKey/nextSlot as nextValue, which is counter intuitive in public data tree
        if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, leaf_slot)) {
            throw std::runtime_error("Leaf slot is GTE low leaf next slot");
        }
        if (value != 0) {
            throw std::runtime_error("Value is nonzero for a non existing slot");
        }
    }

    read_events.emit({
        .value = value,
        .slot = leaf_slot,
        .root = root,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    });
}

} // namespace bb::avm2::simulation
