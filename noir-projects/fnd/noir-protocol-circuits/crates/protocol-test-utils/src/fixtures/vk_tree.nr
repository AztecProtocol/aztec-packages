use crate::utils::pad_end;
use types::{
    constants::{
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX, HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
        INBOX_PARITY_1024_VK_INDEX, INBOX_PARITY_256_VK_INDEX, INBOX_PARITY_64_VK_INDEX,
        MEGA_KERNEL_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_INIT_2_VK_INDEX,
        PRIVATE_KERNEL_INIT_3_VK_INDEX,
        PRIVATE_KERNEL_INIT_4_VK_INDEX, PRIVATE_KERNEL_INIT_5_VK_INDEX,
        PRIVATE_KERNEL_INNER_2_VK_INDEX, PRIVATE_KERNEL_INNER_3_VK_INDEX,
        PRIVATE_KERNEL_INNER_4_VK_INDEX, PRIVATE_KERNEL_INNER_5_VK_INDEX,
        PRIVATE_KERNEL_RESET_VK_INDEX, ROOT_ROLLUP_VK_INDEX, ULTRA_VK_LENGTH_IN_FIELDS,
        VK_TREE_HEIGHT,
    },
    merkle_tree::merkle_tree::MerkleTree,
    proof::{verification_key::VerificationKey, vk_data::VkData},
};

pub global VK_TREE_WIDTH: u32 = (1 as u8 << VK_TREE_HEIGHT as u8) as u32;

pub fn generate_fake_vk_for_index<let N: u32>(vk_index: u32) -> VerificationKey<N> {
    let v = vk_index as Field;
    let key = pad_end([v + 234234, v + 6565, v + 77889900]);
    let hash = v + 123123;
    VerificationKey { key, hash }
}

pub fn generate_fake_honk_vk_for_index(index: u32) -> VerificationKey<ULTRA_VK_LENGTH_IN_FIELDS> {
    generate_fake_vk_for_index(index)
}

pub fn generate_fake_rollup_honk_vk_for_index(
    index: u32,
) -> VerificationKey<ULTRA_VK_LENGTH_IN_FIELDS> {
    generate_fake_vk_for_index(index)
}

pub fn generate_fake_chonk_vk_for_index(
    index: u32,
) -> VerificationKey<MEGA_KERNEL_VK_LENGTH_IN_FIELDS> {
    generate_fake_vk_for_index(index)
}

pub global VK_MERKLE_TREE: MerkleTree<VK_TREE_WIDTH> = {
    let mut leaves = [0; VK_TREE_WIDTH];

    // Fake VK hashes for testing purposes

    // CHONK
    for i in 0..HIDING_KERNEL_TO_PUBLIC_VK_INDEX + 1 {
        leaves[i] = generate_fake_chonk_vk_for_index(i).hash;
    }
    // Creating 4 reset variants.
    for i in PRIVATE_KERNEL_RESET_VK_INDEX..PRIVATE_KERNEL_RESET_VK_INDEX + 4 {
        leaves[i] = generate_fake_chonk_vk_for_index(i).hash;
    }
    // Multi-app init / inner variants live at indices >= PRIVATE_KERNEL_INIT_2_VK_INDEX
    leaves[PRIVATE_KERNEL_INIT_2_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INIT_2_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INIT_3_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INIT_3_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INIT_4_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INIT_4_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INIT_5_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INIT_5_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INNER_2_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INNER_2_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INNER_3_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INNER_3_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INNER_4_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INNER_4_VK_INDEX).hash;
    leaves[PRIVATE_KERNEL_INNER_5_VK_INDEX] =
        generate_fake_chonk_vk_for_index(PRIVATE_KERNEL_INNER_5_VK_INDEX).hash;

    // The message-only block root lives past the reset-variant range, so it's not covered by the rollup-honk loop below.
    leaves[BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX] =
        generate_fake_rollup_honk_vk_for_index(BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX).hash;

    // Rollup Honk
    for i in HIDING_KERNEL_TO_PUBLIC_VK_INDEX + 1..PRIVATE_KERNEL_RESET_VK_INDEX {
        leaves[i] = generate_fake_rollup_honk_vk_for_index(i).hash;
    }

    // Honk
    // The inbox parity ladder circuits are plain UltraHonk (not rollup-honk) and live past the reset range.
    leaves[INBOX_PARITY_64_VK_INDEX] = generate_fake_honk_vk_for_index(INBOX_PARITY_64_VK_INDEX).hash;
    leaves[INBOX_PARITY_256_VK_INDEX] =
        generate_fake_honk_vk_for_index(INBOX_PARITY_256_VK_INDEX).hash;
    leaves[INBOX_PARITY_1024_VK_INDEX] =
        generate_fake_honk_vk_for_index(INBOX_PARITY_1024_VK_INDEX).hash;
    leaves[ROOT_ROLLUP_VK_INDEX] = generate_fake_honk_vk_for_index(ROOT_ROLLUP_VK_INDEX).hash;

    MerkleTree::new(leaves)
};

pub fn update_vk_hash(vk_tree: &mut MerkleTree<VK_TREE_WIDTH>, vk_index: u32, vk_hash: Field) {
    vk_tree.update_leaf_unsafe::<VK_TREE_HEIGHT>(vk_index, vk_hash);
}

pub global vk_tree_root: Field = VK_MERKLE_TREE.get_root();

pub fn get_vk_data<let VkLen: u32>(vk_index: u32) -> VkData<VkLen> {
    let vk = generate_fake_vk_for_index(vk_index);
    let sibling_path = VK_MERKLE_TREE.get_sibling_path(vk_index);
    VkData { vk, leaf_index: vk_index, sibling_path }
}
