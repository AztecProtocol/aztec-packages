#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

#include "barretenberg/vm2/common/constants.hpp"

namespace bb::avm2::simulation {

void NullifierTreeCheck::assert_read(const FF& nullifier,
                                     bool exists,
                                     const NullifierTreeLeafPreimage& low_leaf_preimage,
                                     uint64_t low_leaf_index,
                                     std::span<const FF> sibling_path,
                                     const FF& root)
{
    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, root);

    // Low leaf and value validation
    bool low_leaf_matches = low_leaf_preimage.leaf.nullifier == nullifier;
    if (low_leaf_matches) {
        if (!exists) {
            throw std::runtime_error("Nullifier non-membership check failed");
        }
    } else {
        if (!field_gt.ff_gt(nullifier, low_leaf_preimage.leaf.nullifier)) {
            throw std::runtime_error("Low leaf slot is GTE leaf slot");
        }
        if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, nullifier)) {
            throw std::runtime_error("Leaf slot is GTE low leaf next slot");
        }
        if (exists) {
            throw std::runtime_error("Nullifier membership check failed");
        }
    }

    read_events.emit({
        .nullifier = nullifier,
        .root = root,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    });
}

} // namespace bb::avm2::simulation
