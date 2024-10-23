use crate::constants::{
    VK_TREE_HEIGHT, PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX,
    PRIVATE_KERNEL_RESET_INDEX, PRIVATE_KERNEL_TAIL_INDEX, PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
    EMPTY_NESTED_INDEX, PRIVATE_KERNEL_EMPTY_INDEX, PUBLIC_KERNEL_INNER_INDEX,
    PUBLIC_KERNEL_MERGE_INDEX, PUBLIC_KERNEL_TAIL_INDEX, BASE_PARITY_INDEX, ROOT_PARITY_INDEX,
    BASE_ROLLUP_INDEX, MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_INDEX, BLOCK_MERGE_ROLLUP_INDEX,
    ROOT_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_EMPTY_INDEX, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
};
use crate::merkle_tree::merkle_tree::MerkleTree;
use crate::recursion::verification_key::VerificationKey;
use crate::hash::verification_key_hash;

pub global VK_TREE_WIDTH: u32 = (1 as u8 << VK_TREE_HEIGHT as u8) as u32;

fn generate_fake_vk_for_index<let N: u32>(index: u32) -> [Field; N] {
    let mut vk = [0; N];
    vk[0] = index as Field;
    vk
}

pub fn generate_fake_honk_vk_for_index(
    index: u32,
) -> VerificationKey<HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS> {
    let key = generate_fake_vk_for_index(index);
    VerificationKey { key, hash: verification_key_hash(key) }
}

pub fn generate_fake_client_ivc_vk_for_index(
    index: u32,
) -> VerificationKey<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS> {
    let key = generate_fake_vk_for_index(index);
    VerificationKey { key, hash: verification_key_hash(key) }
}

pub fn get_vk_merkle_tree() -> MerkleTree<VK_TREE_WIDTH> {
    let mut leaves = [0; VK_TREE_WIDTH];

    // Fake VK hashes for testing purposes
    leaves[PRIVATE_KERNEL_INIT_INDEX] =
        generate_fake_client_ivc_vk_for_index(PRIVATE_KERNEL_INIT_INDEX).hash;
    leaves[PRIVATE_KERNEL_INNER_INDEX] =
        generate_fake_client_ivc_vk_for_index(PRIVATE_KERNEL_INNER_INDEX).hash;
    leaves[PRIVATE_KERNEL_TAIL_INDEX] =
        generate_fake_client_ivc_vk_for_index(PRIVATE_KERNEL_TAIL_INDEX).hash;
    leaves[PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX] =
        generate_fake_client_ivc_vk_for_index(PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX).hash;
    leaves[PRIVATE_KERNEL_RESET_INDEX] =
        generate_fake_client_ivc_vk_for_index(PRIVATE_KERNEL_RESET_INDEX).hash;

    leaves[EMPTY_NESTED_INDEX] = generate_fake_honk_vk_for_index(EMPTY_NESTED_INDEX).hash;
    leaves[PRIVATE_KERNEL_EMPTY_INDEX] =
        generate_fake_honk_vk_for_index(PRIVATE_KERNEL_EMPTY_INDEX).hash;
    leaves[PUBLIC_KERNEL_INNER_INDEX] =
        generate_fake_honk_vk_for_index(PUBLIC_KERNEL_INNER_INDEX).hash;
    leaves[PUBLIC_KERNEL_MERGE_INDEX] =
        generate_fake_honk_vk_for_index(PUBLIC_KERNEL_MERGE_INDEX).hash;
    leaves[PUBLIC_KERNEL_TAIL_INDEX] =
        generate_fake_honk_vk_for_index(PUBLIC_KERNEL_TAIL_INDEX).hash;
    leaves[BASE_PARITY_INDEX] = generate_fake_honk_vk_for_index(BASE_PARITY_INDEX).hash;
    leaves[ROOT_PARITY_INDEX] = generate_fake_honk_vk_for_index(ROOT_PARITY_INDEX).hash;
    leaves[BASE_ROLLUP_INDEX] = generate_fake_honk_vk_for_index(BASE_ROLLUP_INDEX).hash;
    leaves[MERGE_ROLLUP_INDEX] = generate_fake_honk_vk_for_index(MERGE_ROLLUP_INDEX).hash;
    leaves[BLOCK_ROOT_ROLLUP_INDEX] = generate_fake_honk_vk_for_index(BLOCK_ROOT_ROLLUP_INDEX).hash;
    leaves[BLOCK_MERGE_ROLLUP_INDEX] =
        generate_fake_honk_vk_for_index(BLOCK_MERGE_ROLLUP_INDEX).hash;
    leaves[ROOT_ROLLUP_INDEX] = generate_fake_honk_vk_for_index(ROOT_ROLLUP_INDEX).hash;
    leaves[BLOCK_ROOT_ROLLUP_EMPTY_INDEX] =
        generate_fake_honk_vk_for_index(BLOCK_ROOT_ROLLUP_EMPTY_INDEX).hash;

    MerkleTree::new(leaves)
}
