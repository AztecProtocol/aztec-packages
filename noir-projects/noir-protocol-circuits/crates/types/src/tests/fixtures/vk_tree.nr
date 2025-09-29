use crate::{
    constants::{
        AVM_VK_INDEX, HIDING_KERNEL_TO_PUBLIC_VK_INDEX, MEGA_VK_LENGTH_IN_FIELDS,
        PARITY_BASE_VK_INDEX, PARITY_ROOT_VK_INDEX, PRIVATE_KERNEL_RESET_INDEX,
        ROOT_ROLLUP_VK_INDEX, ULTRA_VK_LENGTH_IN_FIELDS, VK_TREE_HEIGHT,
    },
    merkle_tree::merkle_tree::MerkleTree,
    proof::{verification_key::VerificationKey, vk_data::VkData},
    tests::utils::pad_end,
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
    leaves[PARITY_BASE_VK_INDEX] = generate_fake_honk_vk_for_index(PARITY_BASE_VK_INDEX).hash;
    leaves[PARITY_ROOT_VK_INDEX] = generate_fake_honk_vk_for_index(PARITY_ROOT_VK_INDEX).hash;
    leaves[ROOT_ROLLUP_VK_INDEX] = generate_fake_honk_vk_for_index(ROOT_ROLLUP_VK_INDEX).hash;

    MerkleTree::new(leaves)
};

impl MerkleTree<VK_TREE_WIDTH> {
    pub fn update_vk_hash(&mut self, vk_index: u32, vk_hash: Field) {
        self.update_leaf::<VK_TREE_HEIGHT>(vk_index, vk_hash);
    }
}

pub global vk_tree_root: Field = VK_MERKLE_TREE.get_root();

pub fn get_vk_data<let VkLen: u32>(vk_index: u32) -> VkData<VkLen> {
    let vk = generate_fake_vk_for_index(vk_index);
    let sibling_path = VK_MERKLE_TREE.get_sibling_path(vk_index);
    VkData { vk, leaf_index: vk_index, sibling_path }
}
