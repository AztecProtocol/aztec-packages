use crate::{
    abis::{L1ToL2MessageSponge, ParityPublicInputs},
    parity::parity_root::{self, ParityBaseProofData, ParityRootPrivateInputs},
};
use protocol_test_utils::{fixtures::vk_tree::{get_vk_data, vk_tree_root}, pad_end};
use types::{
    constants::{
        NUM_BASE_PARITY_PER_ROOT_PARITY, PARITY_BASE_VK_INDEX, PARITY_ROOT_VK_INDEX,
        ULTRA_VK_LENGTH_IN_FIELDS,
    },
    proof::{proof_data::ProofData, vk_data::VkData},
    traits::Empty,
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

        // Thread the rolling hash and the message sponge across the four base segments: each child's start equals the
        // previous child's end.
        let mut children =
            [Self::make_proof_data(0, 0, 0, L1ToL2MessageSponge::empty(), L1ToL2MessageSponge::empty(), 0, vk_data); NUM_BASE_PARITY_PER_ROOT_PARITY];
        let mut start_rolling_hash = 100;
        let mut start_sponge = L1ToL2MessageSponge::empty();
        for i in 0..NUM_BASE_PARITY_PER_ROOT_PARITY {
            let end_rolling_hash = start_rolling_hash + 1000;
            let mut end_sponge = start_sponge;
            end_sponge.absorb([(i + 1) as Field, (i + 1) as Field * 7], 2);
            children[i] = Self::make_proof_data(
                children_sha_roots[i],
                start_rolling_hash,
                end_rolling_hash,
                start_sponge,
                end_sponge,
                (i + 1) as u32,
                vk_data,
            );
            start_rolling_hash = end_rolling_hash;
            start_sponge = end_sponge;
        }

        Self { children }
    }

    fn make_proof_data(
        sha_root: Field,
        start_rolling_hash: Field,
        end_rolling_hash: Field,
        start_sponge: L1ToL2MessageSponge,
        end_sponge: L1ToL2MessageSponge,
        num_msgs: u32,
        vk_data: VkData<ULTRA_VK_LENGTH_IN_FIELDS>,
    ) -> ParityBaseProofData {
        let public_inputs = ParityPublicInputs {
            sha_root,
            converted_root: 0,
            start_rolling_hash,
            end_rolling_hash,
            start_sponge,
            end_sponge,
            num_msgs,
            vk_tree_root,
            prover_id: 42,
        };

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
        let private_inputs = ParityRootPrivateInputs { children: self.children };
        parity_root::execute(private_inputs)
    }
}

#[test]
fn public_inputs_match_expected() {
    let public_inputs = TestBuilder::new().execute();

    let expected_sha_root = 0xa0c56543aa73140e5ca27231eee3107bd4e11d62164feb411d77c9d9b2da47;
    let expected_converted_root =
        0x14e4b977b2203b70e6ee1c2456eb7114d090fe4b907f631eecd0919fed432e7d;

    assert_eq(public_inputs.sha_root, expected_sha_root);
    assert_eq(public_inputs.converted_root, expected_converted_root);
    assert_eq(public_inputs.vk_tree_root, vk_tree_root);
    assert_eq(public_inputs.prover_id, 42);

    // Output start is the first child's start, output end is the last child's end, and counts are summed.
    assert_eq(public_inputs.start_rolling_hash, 100);
    assert_eq(public_inputs.end_rolling_hash, 100 + NUM_BASE_PARITY_PER_ROOT_PARITY as Field * 1000);
    assert_eq(public_inputs.num_msgs, 1 + 2 + 3 + 4);

    // The message sponge threads the same way: output start is the first child's start (empty), output end is the last
    // child's end.
    assert_eq(public_inputs.start_sponge, L1ToL2MessageSponge::empty());
    let mut expected_end_sponge = L1ToL2MessageSponge::empty();
    for i in 0..NUM_BASE_PARITY_PER_ROOT_PARITY {
        expected_end_sponge.absorb([(i + 1) as Field, (i + 1) as Field * 7], 2);
    }
    assert_eq(public_inputs.end_sponge, expected_end_sponge);
}

#[test(should_fail_with = "Inconsistent rolling hash across parity base circuits")]
fn inconsistent_rolling_hash() {
    let mut builder = TestBuilder::new();

    // Break the chain continuity between the second and third child.
    builder.children[2].public_inputs.start_rolling_hash += 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "Inconsistent message sponge across parity base circuits")]
fn inconsistent_message_sponge() {
    let mut builder = TestBuilder::new();

    // Break the sponge continuity between the second and third child.
    builder.children[2].public_inputs.start_sponge.num_absorbed += 1;

    let _ = builder.execute();
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

#[test(should_fail_with = "Inconsistent prover ids across parity base circuits")]
fn inconsistent_prover_ids() {
    let mut builder = TestBuilder::new();

    // Tweak the prover_id of the second child.
    builder.children[1].public_inputs.prover_id += 1;

    let _ = builder.execute();
}
