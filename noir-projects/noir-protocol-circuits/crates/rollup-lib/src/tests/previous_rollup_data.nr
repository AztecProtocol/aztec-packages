use crate::abis::previous_rollup_data::PreviousRollupData;
use dep::types::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, sponge_blob::SpongeBlob},
    constants::PUBLIC_BASE_ROLLUP_VK_INDEX,
    merkle_tree::merkle_tree::MerkleTree,
    proof::vk_data::VkData,
    tests::fixtures,
    traits::Empty,
};

pub fn default_previous_rollup_data<let N: u32, let M: u32>(
    blob_fields_0: [Field; N],
    blob_fields_1: [Field; M],
) -> [PreviousRollupData; 2] {
    let mut previous_rollup_data = [PreviousRollupData::empty(); 2];

    let vk_index = PUBLIC_BASE_ROLLUP_VK_INDEX;
    let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> = fixtures::vk_tree::VK_MERKLE_TREE;
    let vk_path = vk_tree.get_sibling_path(vk_index);
    let vk_tree_root = vk_tree.get_root();

    previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants.vk_tree_root =
        vk_tree_root;
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants.vk_tree_root =
        vk_tree_root;

    let vk_data = VkData {
        vk: fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index),
        leaf_index: vk_index,
        sibling_path: vk_path,
    };
    previous_rollup_data[0].vk_data = vk_data;
    previous_rollup_data[1].vk_data = vk_data;

    previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.note_hash_tree =
        AppendOnlyTreeSnapshot { root: 0, next_available_leaf_index: 0 };
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.end.note_hash_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 1 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.note_hash_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 1 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.end.note_hash_tree =
        AppendOnlyTreeSnapshot { root: 2, next_available_leaf_index: 2 };

    previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.nullifier_tree =
        AppendOnlyTreeSnapshot { root: 0, next_available_leaf_index: 0 };
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.end.nullifier_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 1 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.nullifier_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 1 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.end.nullifier_tree =
        AppendOnlyTreeSnapshot { root: 2, next_available_leaf_index: 2 };

    previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.public_data_tree =
        AppendOnlyTreeSnapshot { root: 0, next_available_leaf_index: 1 };
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.end.public_data_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 2 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.public_data_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 2 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.end.public_data_tree =
        AppendOnlyTreeSnapshot { root: 2, next_available_leaf_index: 3 };
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.public_data_tree =
        AppendOnlyTreeSnapshot { root: 0, next_available_leaf_index: 1 };
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.end.public_data_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 2 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.public_data_tree =
        AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 2 };
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.end.public_data_tree =
        AppendOnlyTreeSnapshot { root: 2, next_available_leaf_index: 3 };

    previous_rollup_data[0].base_or_merge_rollup_public_inputs.num_txs = 1;
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.num_txs = 1;

    let mut sponge_blob = SpongeBlob::new(N + M);
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob = sponge_blob;

    sponge_blob.absorb(blob_fields_0, N);
    previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_sponge_blob = sponge_blob;
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.start_sponge_blob = sponge_blob;

    sponge_blob.absorb(blob_fields_1, M);
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_sponge_blob = sponge_blob;

    previous_rollup_data[0].base_or_merge_rollup_public_inputs.out_hash = 1;
    previous_rollup_data[1].base_or_merge_rollup_public_inputs.out_hash = 2;

    previous_rollup_data
}
