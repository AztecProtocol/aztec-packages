use dep::parity_lib::root::root_rollup_parity_input::RootRollupParityInput;
use dep::types::constants::ROOT_PARITY_INDEX;
use dep::types::tests::fixtures;
use dep::types::traits::Empty;
use types::merkle_tree::merkle_tree::MerkleTree;

pub fn default_root_rollup_parity_input() -> RootRollupParityInput {
    let mut input = RootRollupParityInput::empty();

    let vk_index = ROOT_PARITY_INDEX;
    let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
        comptime { fixtures::vk_tree::get_vk_merkle_tree() };
    let vk_path = vk_tree.get_sibling_path(vk_index);
    let vk_tree_root = vk_tree.get_root();

    input.verification_key = fixtures::vk_tree::generate_fake_honk_vk_for_index(vk_index);
    input.vk_path = vk_path;
    input.public_inputs.vk_tree_root = vk_tree_root;

    input
}
