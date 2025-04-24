#include "barretenberg/vm2/simulation/update_check.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/stringify.hpp"

namespace bb::avm2::simulation {

namespace {

using UnconstrainedPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

FF unconstrained_read(const LowLevelMerkleDBInterface& merkle_db, const FF& leaf_slot)
{
    auto [present, index] = merkle_db.get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_slot);
    auto preimage = merkle_db.get_leaf_preimage_public_data_tree(index);
    return present ? preimage.leaf.value : 0;
}

} // namespace

void UpdateCheck::check_current_class_id(const AztecAddress& address, const ContractInstance& instance)
{
    // Compute the public data tree slots
    FF shared_mutable_slot = poseidon2.hash({ UPDATED_CLASS_IDS_SLOT, address });
    FF shared_mutable_hash_slot = shared_mutable_slot + UPDATES_SHARED_MUTABLE_VALUES_LEN;
    FF shared_mutable_leaf_slot =
        poseidon2.hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, shared_mutable_hash_slot });

    // Read the hash from the tree. We do a trick with shared mutables (updates are shared mutables) where we store in
    // one public data tree slot the hash of the whole structure. This is nice because in circuits you can receive the
    // preimage as a hint and just read 1 storage slot instead of 3. We do that here, we will constrain the hash read
    // but then read in unconstrained mode the preimage. The PIL for this gadget constrains the hash.
    FF hash = merkle_db.storage_read(shared_mutable_leaf_slot);

    uint256_t update_preimage_metadata = 0;
    FF update_preimage_pre_class_id = 0;
    FF update_preimage_post_class_id = 0;

    if (hash == 0) {
        // If the shared mutable has never been written, then the contract was never updated. We short circuit early.
        if (instance.original_class_id != instance.current_class_id) {
            throw std::runtime_error("Current class id does not match expected class id");
        }
    } else {
        // Read the preimage from the tree in unconstrained mode
        LowLevelMerkleDBInterface& unconstrained_merkle_db = merkle_db.as_unconstrained();

        std::vector<FF> update_preimage(3);

        for (size_t i = 0; i < update_preimage.size(); ++i) {
            FF leaf_slot = UnconstrainedPoseidon2::hash(
                { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, shared_mutable_slot + i });
            update_preimage[i] = unconstrained_read(unconstrained_merkle_db, leaf_slot);
        }

        // Double check that the unconstrained reads match the hash. This is just a sanity check, if slow, can be
        // removed.
        FF reconstructed_hash = poseidon2.hash(update_preimage);
        if (hash != reconstructed_hash) {
            throw std::runtime_error("Stored hash does not match preimage hash");
        }

        update_preimage_metadata = static_cast<uint256_t>(update_preimage[0]);
        update_preimage_pre_class_id = update_preimage[1];
        update_preimage_post_class_id = update_preimage[2];

        // Decompose the metadata: we want the least significant 32 bits since that's the block of change.
        uint128_t update_metadata_hi = static_cast<uint128_t>(update_preimage_metadata >> BLOCK_NUMBER_BIT_SIZE);
        uint32_t update_block_of_change = static_cast<uint32_t>(update_preimage_metadata & 0xffffffff);
        range_check.assert_range(update_metadata_hi, UPDATES_SHARED_MUTABLE_METADATA_BIT_SIZE - BLOCK_NUMBER_BIT_SIZE);
        range_check.assert_range(update_block_of_change, BLOCK_NUMBER_BIT_SIZE);

        // pre and post can be zero, if they have never been touched. In that case we need to use the original class id.
        FF pre_class = update_preimage_pre_class_id == 0 ? instance.original_class_id : update_preimage_pre_class_id;
        FF post_class = update_preimage_post_class_id == 0 ? instance.original_class_id : update_preimage_post_class_id;

        FF expected_current_class_id = current_block_number < update_block_of_change ? pre_class : post_class;
        uint32_t block_of_change_subtraction = current_block_number < update_block_of_change
                                                   ? update_block_of_change - 1 - current_block_number
                                                   : current_block_number - update_block_of_change;

        range_check.assert_range(block_of_change_subtraction, BLOCK_NUMBER_BIT_SIZE);

        if (expected_current_class_id != instance.current_class_id) {
            throw std::runtime_error(
                "Current class id: " + field_to_string(instance.current_class_id) +
                " does not match expected class id: " + field_to_string(expected_current_class_id));
        }
    }

    update_check_events.emit({
        .address = address,
        .current_class_id = instance.current_class_id,
        .original_class_id = instance.original_class_id,
        .public_data_tree_root = merkle_db.get_tree_roots().publicDataTree.root,
        .current_block_number = current_block_number,
        .update_hash = hash,
        .update_preimage_metadata = update_preimage_metadata,
        .update_preimage_pre_class_id = update_preimage_pre_class_id,
        .update_preimage_post_class_id = update_preimage_post_class_id,
        .shared_mutable_slot = shared_mutable_slot,
        .shared_mutable_leaf_slot = shared_mutable_leaf_slot,
    });
}

} // namespace bb::avm2::simulation
