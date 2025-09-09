use crate::constants::{
    AVM_VK_INDEX, BASE_PARITY_INDEX, HIDING_KERNEL_TO_PUBLIC_VK_INDEX, MEGA_VK_LENGTH_IN_FIELDS,
    PRIVATE_KERNEL_RESET_INDEX, ROOT_PARITY_INDEX, ROOT_ROLLUP_INDEX, ULTRA_VK_LENGTH_IN_FIELDS,
    VK_TREE_HEIGHT,
};
use crate::merkle_tree::merkle_tree::MerkleTree;
use crate::{proof::verification_key::VerificationKey, tests::utils::pad_end_with_empty};

pub global VK_TREE_WIDTH: u32 = (1 as u8 << VK_TREE_HEIGHT as u8) as u32;

pub fn generate_fake_vk_for_index<let N: u32>(vk_index: u32) -> VerificationKey<N> {
    let v = vk_index as Field;
    let key = pad_end_with_empty([v + 234234, v + 6565, v + 77889900]);
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

pub fn generate_fake_client_ivc_vk_for_index(
    index: u32,
) -> VerificationKey<MEGA_VK_LENGTH_IN_FIELDS> {
    generate_fake_vk_for_index(index)
}

pub global VK_MERKLE_TREE: MerkleTree<VK_TREE_WIDTH> = {
    let mut leaves = [0; VK_TREE_WIDTH];

    // Fake VK hashes for testing purposes

    // Client IVC
    for i in 0..HIDING_KERNEL_TO_PUBLIC_VK_INDEX + 1 {
        leaves[i] = generate_fake_client_ivc_vk_for_index(i).hash;
    }
    // Creating 4 reset variants.
    for i in PRIVATE_KERNEL_RESET_INDEX..PRIVATE_KERNEL_RESET_INDEX + 4 {
        leaves[i] = generate_fake_client_ivc_vk_for_index(i).hash;
    }

    // Rollup Honk
    for i in HIDING_KERNEL_TO_PUBLIC_VK_INDEX + 1..PRIVATE_KERNEL_RESET_INDEX {
        leaves[i] = generate_fake_rollup_honk_vk_for_index(i).hash;
    }

    // Honk
    // Override some of the above with Honk Vks.
    leaves[AVM_VK_INDEX] = generate_fake_honk_vk_for_index(AVM_VK_INDEX).hash;
    leaves[BASE_PARITY_INDEX] = generate_fake_honk_vk_for_index(BASE_PARITY_INDEX).hash;
    leaves[ROOT_PARITY_INDEX] = generate_fake_honk_vk_for_index(ROOT_PARITY_INDEX).hash;
    leaves[ROOT_ROLLUP_INDEX] = generate_fake_honk_vk_for_index(ROOT_ROLLUP_INDEX).hash;

    MerkleTree::new(leaves)
};
