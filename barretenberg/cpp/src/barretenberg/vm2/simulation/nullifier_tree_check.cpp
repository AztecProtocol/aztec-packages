#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/constants.hpp"

namespace bb::avm2::simulation {

FF NullifierTreeCheck::silo_nullifier(FF nullifier, AztecAddress contract_address)
{
    return poseidon2.hash({ GENERATOR_INDEX__OUTER_NULLIFIER, contract_address, nullifier });
}

void NullifierTreeCheck::validate_low_leaf(FF nullifier,
                                           const NullifierTreeLeafPreimage& low_leaf_preimage,
                                           bool exists)
{
    bool low_leaf_matches = low_leaf_preimage.leaf.nullifier == nullifier;
    if (low_leaf_matches) {
        if (!exists) {
            throw std::runtime_error("Nullifier non-membership check failed");
        }
    } else {
        if (!field_gt.ff_gt(nullifier, low_leaf_preimage.leaf.nullifier)) {
            throw std::runtime_error("Low leaf value is GTE leaf value");
        }
        if (low_leaf_preimage.nextKey != 0 && !field_gt.ff_gt(low_leaf_preimage.nextKey, nullifier)) {
            throw std::runtime_error("Leaf value is GTE low leaf next value");
        }
        if (exists) {
            throw std::runtime_error("Nullifier membership check failed");
        }
    }
}

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
    validate_low_leaf(nullifier, low_leaf_preimage, exists);

    events.emit(NullifierTreeReadWriteEvent{
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf_preimage,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    });
}

AppendOnlyTreeSnapshot NullifierTreeCheck::write(FF nullifier,
                                                 std::optional<AztecAddress> contract_address,
                                                 uint64_t nullifier_counter,
                                                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                                                 uint64_t low_leaf_index,
                                                 std::span<const FF> low_leaf_sibling_path,
                                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                                 std::optional<std::span<const FF>> insertion_sibling_path)
{
    FF source_nullifier = nullifier;
    std::optional<NullifierSiloingData> siloing_data = std::nullopt;
    if (contract_address.has_value()) {
        nullifier = silo_nullifier(nullifier, contract_address.value());
        siloing_data = NullifierSiloingData{ .siloed_nullifier = nullifier, .address = contract_address.value() };
    }
    bool exists = !insertion_sibling_path.has_value();

    // Low leaf validation
    validate_low_leaf(nullifier, low_leaf_preimage, exists);

    AppendOnlyTreeSnapshot next_snapshot = prev_snapshot;
    std::optional<NullifierAppendData> append_data = std::nullopt;

    FF low_leaf_hash = poseidon2.hash(low_leaf_preimage.get_hash_inputs());

    if (exists) {
        merkle_check.assert_membership(low_leaf_hash, low_leaf_index, low_leaf_sibling_path, prev_snapshot.root);
    } else {
        // Low leaf update
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

        FF write_root = merkle_check.write(FF(0),
                                           new_leaf_hash,
                                           prev_snapshot.nextAvailableLeafIndex,
                                           insertion_sibling_path.value(),
                                           intermediate_root);

        next_snapshot = AppendOnlyTreeSnapshot{
            .root = write_root,
            .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1,
        };
        append_data = NullifierAppendData{
            .updated_low_leaf_hash = updated_low_leaf_hash,
            .new_leaf_hash = new_leaf_hash,
            .intermediate_root = intermediate_root,
        };
    }

    events.emit(NullifierTreeReadWriteEvent{ .nullifier = source_nullifier,
                                             .prev_snapshot = prev_snapshot,
                                             .next_snapshot = next_snapshot,
                                             .low_leaf_preimage = low_leaf_preimage,
                                             .low_leaf_hash = low_leaf_hash,
                                             .low_leaf_index = low_leaf_index,
                                             .write = true,
                                             .siloing_data = siloing_data,
                                             .nullifier_counter = nullifier_counter,
                                             .append_data = append_data });

    return next_snapshot;
}

} // namespace bb::avm2::simulation
