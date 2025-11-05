use crate::{
    parity_public_inputs::ParityPublicInputs,
    root::parity_root_private_inputs::{ParityBaseProofData, ParityRootPrivateInputs},
};
use types::{
    constants::{
        NUM_BASE_PARITY_PER_ROOT_PARITY, PARITY_BASE_VK_INDEX, PARITY_ROOT_VK_INDEX,
        ULTRA_VK_LENGTH_IN_FIELDS,
    },
    proof::{proof_data::ProofData, vk_data::VkData},
    tests::{fixtures::vk_tree::{get_vk_data, vk_tree_root}, utils::pad_end},
};

struct TestBuilder {
    children: [ParityBaseProofData; NUM_BASE_PARITY_PER_ROOT_PARITY],
}

impl TestBuilder {
    pub fn new() -> Self {
        let vk_data = get_vk_data(PARITY_BASE_VK_INDEX);

        // 31 byte test SHA roots
        let children_sha_roots = [
            0xb3a3fc1968999f2c2d798b900bdf0de41311be2a4d20496a7e792a521fc8ab,
            0x43f78e0ebc9633ce336a8c086064d898c32fb5d7d6011f5427459c0b8d14e9,
            0x024259b6404280addcc9319bc5a32c9a5d56af5c93b2f941fa326064fbe963,
            0x53042d820859d80c474d4694e03778f8dc0ac88fc1c3a97b4369c1096e904a,
        ];

        let children = children_sha_roots.map(|sha_root| Self::make_proof_data(sha_root, vk_data));

        Self { children }
    }

    fn make_proof_data(
        sha_root: Field,
        vk_data: VkData<ULTRA_VK_LENGTH_IN_FIELDS>,
    ) -> ParityBaseProofData {
        let public_inputs = ParityPublicInputs { sha_root, converted_root: 0, vk_tree_root };

        let value_offset = sha_root / 2;
        ProofData {
            public_inputs,
            proof: pad_end(
                [value_offset + 450343, value_offset + 27394, value_offset + 8003179],
            ),
            vk_data,
        }
    }

    pub fn execute(self) -> ParityPublicInputs {
        ParityRootPrivateInputs { children: self.children }.execute()
    }
}

#[test]
fn public_inputs_match_expected() {
    let public_inputs = TestBuilder::new().execute();

    let expected_sha_root = 0xa0c56543aa73140e5ca27231eee3107bd4e11d62164feb411d77c9d9b2da47;
    let expected_converted_root =
        0x0e34ac2c09f45a503d2908bcb12f1cbae5fa4065759c88d501c097506a8b2290;

    assert_eq(public_inputs.sha_root, expected_sha_root);
    assert_eq(public_inputs.converted_root, expected_converted_root);
    assert_eq(public_inputs.vk_tree_root, vk_tree_root);
}

#[test(should_fail_with = "Inconsistent vk tree roots across parity base circuits")]
fn inconsistent_vk_tree_root() {
    let mut builder = TestBuilder::new();

    // Tweak the vk tree root of the second child.
    builder.children[1].public_inputs.vk_tree_root += 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn incorrect_vk_tree_root() {
    let mut builder = TestBuilder::new();

    // Change the vk tree root of all children.
    for i in 0..NUM_BASE_PARITY_PER_ROOT_PARITY {
        builder.children[i].public_inputs.vk_tree_root += 1;
    }

    let _ = builder.execute();
}

#[test(should_fail_with = "Inconsistent vk hashes across parity base circuits")]
fn inconsistent_vk_hashes() {
    let mut builder = TestBuilder::new();

    // Tweak the vk hash of the third child.
    builder.children[2].vk_data.vk.hash += 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "Inconsistent vk indices across parity base circuits")]
fn inconsistent_vk_indices() {
    let mut builder = TestBuilder::new();

    // Change the vk leaf index of the last child to be the root parity index.
    builder.children[3].vk_data.leaf_index = PARITY_ROOT_VK_INDEX;

    let _ = builder.execute();
}

#[test(should_fail_with = "Inconsistent vk paths across parity base circuits")]
fn inconsistent_vk_paths() {
    let mut builder = TestBuilder::new();

    // Tweak the vk path of the first child.
    builder.children[0].vk_data.sibling_path[0] += 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "Incorrect vk index for parity base")]
fn incorrect_vk_index() {
    let mut builder = TestBuilder::new();

    // Change the vk leaf index of all children to be the root parity index.
    for i in 0..NUM_BASE_PARITY_PER_ROOT_PARITY {
        builder.children[i].vk_data.leaf_index = PARITY_ROOT_VK_INDEX;
    }

    let _ = builder.execute();
}
