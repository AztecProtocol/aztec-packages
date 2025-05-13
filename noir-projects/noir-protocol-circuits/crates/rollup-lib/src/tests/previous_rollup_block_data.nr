use crate::abis::previous_rollup_block_data::PreviousRollupBlockData;
use dep::types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use dep::types::constants::BLOCK_ROOT_ROLLUP_INDEX;
use dep::types::merkle_tree::MembershipWitness;
use dep::types::tests::fixtures;
use dep::types::traits::Empty;
use types::merkle_tree::merkle_tree::MerkleTree;

pub fn default_previous_rollup_block_data() -> [PreviousRollupBlockData; 2] {
    let mut previous_rollup_data = [PreviousRollupBlockData::empty(); 2];

    let vk_index = BLOCK_ROOT_ROLLUP_INDEX;
    let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> = fixtures::vk_tree::VK_MERKLE_TREE;
    let vk_path = vk_tree.get_sibling_path(vk_index);
    let vk_tree_root = vk_tree.get_root();

    previous_rollup_data[0].block_root_or_block_merge_public_inputs.vk_tree_root = vk_tree_root;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.vk_tree_root = vk_tree_root;

    previous_rollup_data[0].vk =
        fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
    previous_rollup_data[1].vk =
        fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);

    previous_rollup_data[0].vk_witness =
        MembershipWitness { leaf_index: vk_index as Field, sibling_path: vk_path };
    previous_rollup_data[1].vk_witness =
        MembershipWitness { leaf_index: vk_index as Field, sibling_path: vk_path };

    previous_rollup_data[0].block_root_or_block_merge_public_inputs.previous_archive =
        AppendOnlyTreeSnapshot { root: 0, next_available_leaf_index: 0 };
    previous_rollup_data[0].block_root_or_block_merge_public_inputs.new_archive =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 1 };
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.previous_archive =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 1 };
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.new_archive =
        AppendOnlyTreeSnapshot { root: 2, next_available_leaf_index: 2 };

    // previous_rollup_data is from one block_root circuit => ecompasses a single block (block 1)
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.start_global_variables.block_number =
        1;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.end_global_variables.block_number =
        1;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.start_global_variables.timestamp =
        2;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.end_global_variables.timestamp =
        2;

    previous_rollup_data[0].block_root_or_block_merge_public_inputs.out_hash = 1;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.out_hash = 2;

    previous_rollup_data[0].block_root_or_block_merge_public_inputs.fees[0].value = 10;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.fees[0].value = 15;

    previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.z =
        1;
    previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.blob_commitments_hash =
        2;
    previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.gamma =
        3;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.start_blob_accumulator = previous_rollup_data[0]
        .block_root_or_block_merge_public_inputs
        .blob_public_inputs
        .end_blob_accumulator;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.z =
        4;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.blob_commitments_hash =
        5;
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.gamma =
        6;

    previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.final_blob_challenges.z =
        4;
    // = poseidon2([6, 4]) = 0x25f106373d285972efcdfcbc99096a989156495514c4e1bc6cfac2b288ade5e7:
    previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.final_blob_challenges.gamma.limbs =
        [448024886556591125833969477526349287, 32274159084860741962424622034622609, 9713];
    previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.final_blob_challenges = previous_rollup_data[0]
        .block_root_or_block_merge_public_inputs
        .blob_public_inputs
        .final_blob_challenges;

    previous_rollup_data
}
