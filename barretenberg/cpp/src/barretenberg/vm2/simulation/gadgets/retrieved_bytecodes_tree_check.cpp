#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"

#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

void RetrievedBytecodesTreeCheck::validate_low_leaf_jumps_over_class_id(
    const RetrievedBytecodesTreeLeafPreimage& low_leaf_preimage, const FF& class_id)
{
    if (!field_gt.ff_gt(class_id, low_leaf_preimage.leaf.class_id)) {
        throw std::runtime_error("Low leaf class_id is GTE class id");
    }
    if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, class_id)) {
        throw std::runtime_error("Class id is GTE low leaf next class id");
    }
}

bool RetrievedBytecodesTreeCheck::contains(const FF& class_id)
{
    const auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(class_id);
    auto sibling_path = tree.get_sibling_path(low_leaf_index);
    auto low_leaf_preimage = tree.get_leaf_preimage(low_leaf_index);

    // Low leaf membership
    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    merkle_check.assert_membership(low_leaf_hash, low_leaf_index, sibling_path, snapshot.root);

    if (exists) {
        if (low_leaf_preimage.leaf.class_id != class_id) {
            throw std::runtime_error("Class id membership check failed");
        }
    } else {
        validate_low_leaf_jumps_over_class_id(low_leaf_preimage, class_id);
    }

    events.emit(RetrievedBytecodesTreeCheckEvent{
        .class_id = class_id,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = false,
        .append_data = std::nullopt,
    });

    return exists;
}

void RetrievedBytecodesTreeCheck::insert(const FF& class_id)
{
    AppendOnlyTreeSnapshot prev_snapshot = tree.get_snapshot();
    auto insertion_result = tree.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });
    auto& [low_leaf_preimage, low_leaf_index, low_leaf_sibling_path] = insertion_result.low_leaf_witness_data.at(0);
    std::span<FF> insertion_sibling_path = insertion_result.insertion_witness_data.at(0).path;

    bool exists = class_id == low_leaf_preimage.leaf.class_id;

    AppendOnlyTreeSnapshot next_snapshot = prev_snapshot;
    std::optional<RetrievedBytecodeAppendData> append_data = std::nullopt;

    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());
    if (exists) {
        merkle_check.assert_membership(low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);
    } else {
        validate_low_leaf_jumps_over_class_id(low_leaf_preimage, class_id);
        // Low leaf update
        RetrievedBytecodesTreeLeafPreimage updated_low_leaf_preimage = low_leaf_preimage;
        updated_low_leaf_preimage.nextIndex = prev_snapshot.nextAvailableLeafIndex;
        updated_low_leaf_preimage.nextKey = class_id;

        FF updated_low_leaf_hash = poseidon2.hash(updated_low_leaf_preimage.get_hash_inputs());

        FF intermediate_root = merkle_check.write(
            low_leaf_hash, updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);

        RetrievedBytecodesTreeLeafPreimage new_leaf_preimage = RetrievedBytecodesTreeLeafPreimage(
            ClassIdLeafValue(class_id), low_leaf_preimage.nextIndex, low_leaf_preimage.nextKey);

        FF new_leaf_hash = poseidon2.hash(new_leaf_preimage.get_hash_inputs());

        FF write_root = merkle_check.write(
            FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, insertion_sibling_path, intermediate_root);

        next_snapshot = AppendOnlyTreeSnapshot{
            .root = write_root,
            .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1,
        };
        assert(next_snapshot == tree.get_snapshot());
        append_data = RetrievedBytecodeAppendData{
            .updated_low_leaf_hash = updated_low_leaf_hash,
            .new_leaf_hash = new_leaf_hash,
            .intermediate_root = intermediate_root,
        };
    }

    events.emit(RetrievedBytecodesTreeCheckEvent{
        .class_id = class_id,
        .prev_snapshot = prev_snapshot,
        .next_snapshot = next_snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
        .append_data = append_data,
    });
}

AppendOnlyTreeSnapshot RetrievedBytecodesTreeCheck::get_snapshot() const
{
    return tree.get_snapshot();
}

uint32_t RetrievedBytecodesTreeCheck::size() const
{
    // -1 Since the tree has a prefill leaf at index 0.
    return static_cast<uint32_t>(tree.get_snapshot().nextAvailableLeafIndex) - 1;
}

} // namespace bb::avm2::simulation
