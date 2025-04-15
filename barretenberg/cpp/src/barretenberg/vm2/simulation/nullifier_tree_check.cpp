#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/constants.hpp"

namespace bb::avm2::simulation {

void NullifierTreeCheck::assert_read(const FF& nullifier,
                                     bool exists,
                                     const NullifierTreeLeafPreimage& low_leaf_preimage,
                                     uint64_t low_leaf_index,
                                     std::span<const FF> sibling_path,
                                     const AppendOnlyTreeSnapshot& snapshot)
{
    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

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

    events.emit({
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    });
}

AppendOnlyTreeSnapshot NullifierTreeCheck::write(const FF& nullifier,
                                                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                                                 uint64_t low_leaf_index,
                                                 std::span<const FF> low_leaf_sibling_path,
                                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                                 std::span<const FF> insertion_sibling_path)
{
    // Low leaf validation
    if (low_leaf_preimage.leaf.nullifier == nullifier) {
        throw std::runtime_error("Nullifier already exists");
    }

    if (!field_gt.ff_gt(nullifier, low_leaf_preimage.leaf.nullifier)) {
        throw std::runtime_error("Low leaf slot is GTE leaf slot");
    }
    if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, nullifier)) {
        throw std::runtime_error("Leaf slot is GTE low leaf next slot");
    }

    // Low leaf update
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());

    NullifierTreeLeafPreimage updated_low_leaf_preimage = low_leaf_preimage;
    updated_low_leaf_preimage.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf_preimage.nextKey = nullifier;
    FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

    FF intermediate_root = merkle_check.write(
        low_leaf_hash, updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);

    // Insertion

    NullifierTreeLeafPreimage new_leaf_preimage = NullifierTreeLeafPreimage(
        NullifierLeafValue(nullifier), low_leaf_preimage.nextIndex, low_leaf_preimage.nextKey);

    FF new_leaf_hash = poseidon2.hash(new_leaf_preimage.get_hash_inputs());

    FF write_root = merkle_check.write(
        FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, insertion_sibling_path, intermediate_root);

    AppendOnlyTreeSnapshot next_snapshot = AppendOnlyTreeSnapshot{
        .root = write_root,
        .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1,
    };

    events.emit({ .nullifier = nullifier,
                  .prev_snapshot = prev_snapshot,
                  .next_snapshot = next_snapshot,
                  .low_leaf_preimage = low_leaf_preimage,
                  .low_leaf_hash = low_leaf_hash,
                  .low_leaf_index = low_leaf_index,
                  .write_data = NullifierWriteData{
                      .updated_low_leaf_hash = updated_low_leaf_hash,
                      .new_leaf_hash = new_leaf_hash,
                      .intermediate_root = intermediate_root,
                  } });

    return next_snapshot;
}

} // namespace bb::avm2::simulation
