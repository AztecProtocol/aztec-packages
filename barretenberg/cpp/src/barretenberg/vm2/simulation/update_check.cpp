#include "barretenberg/vm2/simulation/update_check.hpp"

#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include <stdexcept>

namespace bb::avm2::simulation {

namespace {

FF unconstrained_read(const FF& leaf_slot, const LowLevelMerkleDBInterface& merkle_db)
{
    auto [present, index] = merkle_db.get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_slot);
    auto preimage = merkle_db.get_leaf_preimage_public_data_tree(index);
    return present ? preimage.value.value : 0;
}

} // namespace

void UpdateCheck::check_current_class_id(const AztecAddress& address, const ContractInstance& instance)
{
    FF shared_mutable_slot = poseidon2.hash({ UPDATED_CLASS_IDS_SLOT, address });
    FF shared_mutable_hash_slot = shared_mutable_slot + UPDATES_SHARED_MUTABLE_VALUES_LEN;
    FF shared_mutable_leaf_slot =
        poseidon2.hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, shared_mutable_hash_slot });
    // Read the hash from the tree
    FF hash = merkle_db.storage_read(shared_mutable_leaf_slot);

    // Read the preimage from the tree in unconstrained mode
    LowLevelMerkleDBInterface& unconstrained_merkle_db = merkle_db.as_unconstrained();

    std::vector<FF> update_preimage(4);

    for (size_t i = 0; i < update_preimage.size(); ++i) {
        update_preimage[i] = unconstrained_read(shared_mutable_slot + i, unconstrained_merkle_db);
    }

    if (hash == 0) {
        // The 4 preimage items must be zero
        for (const auto& preimage_item : update_preimage) {
            if (preimage_item != 0) {
                throw std::runtime_error("Update is not zero with zero hash");
            }
        }
    } else {
        FF reconstructed_hash = poseidon2.hash(update_preimage);
        if (hash != reconstructed_hash) {
            throw std::runtime_error("Stored hash does not match preimage hash");
        }
    }

    FF update_preimage_delay = update_preimage[0];
    FF update_preimage_pre_class = update_preimage[1];
    FF update_preimage_post_class = update_preimage[2];
    uint32_t update_preimage_block_of_change = static_cast<uint32_t>(update_preimage[3]);

    FF pre_class = update_preimage_pre_class == 0 ? instance.original_class_id : update_preimage_pre_class;
    FF post_class = update_preimage_post_class == 0 ? instance.original_class_id : update_preimage_post_class;

    FF expected_current_class_id = block_number < update_preimage_block_of_change ? pre_class : post_class;

    if (expected_current_class_id != instance.current_class_id) {
        throw std::runtime_error("Current class id does not match expected class id");
    }

    update_check_events.emit({
        .address = address,
        .current_class_id = instance.current_class_id,
        .original_class_id = instance.original_class_id,
        .public_data_tree_root = merkle_db.get_tree_roots().publicDataTree.root,
        .block_number = block_number,
        .update_hash = hash,
        .update_delay = update_preimage_delay,
        .update_pre_class = update_preimage_pre_class,
        .update_post_class = update_preimage_post_class,
        .update_block_of_change = update_preimage_block_of_change,
        .shared_mutable_slot = shared_mutable_slot,
        .shared_mutable_leaf_slot = shared_mutable_leaf_slot,
    });
}

} // namespace bb::avm2::simulation
