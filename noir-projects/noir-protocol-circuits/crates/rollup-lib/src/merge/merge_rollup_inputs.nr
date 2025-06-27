use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use crate::abis::previous_rollup_data::PreviousRollupData;
use crate::merge::utils::{
    merge_rollups::merge_rollups, validate_consecutive_rollups::validate_consecutive_rollups,
};
use dep::types::{
    constants::{MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX},
    proof::traits::Verifiable,
    traits::Empty,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

pub struct MergeRollupInputs {
    pub previous_rollup_data: [PreviousRollupData; 2],
}

impl Empty for MergeRollupInputs {
    fn empty() -> Self {
        MergeRollupInputs { previous_rollup_data: [PreviousRollupData::empty(); 2] }
    }
}

impl MergeRollupInputs {
    pub fn merge_rollup_circuit(self) -> BaseOrMergeRollupPublicInputs {
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify();
            self.previous_rollup_data[0].validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

            self.previous_rollup_data[1].verify();
            self.previous_rollup_data[1].validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        let left = self.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        let right = self.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

        validate_consecutive_rollups(left, right);

        merge_rollups(left, right)
    }
}

mod tests {
    use crate::tests::merge_rollup_inputs::default_merge_rollup_inputs;
    use dep::types::constants::{
        MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, ROOT_PARITY_INDEX,
    };
    use types::merkle_tree::merkle_tree::MerkleTree;
    use types::tests::fixtures;

    #[test(should_fail_with = "The rollup should be filled greedily from L to R, but received a L base and R merge")]
    fn different_rollup_type_fails() {
        let mut inputs = default_merge_rollup_inputs();
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.num_txs = 1; // base
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.num_txs = 2; // merge
        let _output = inputs.merge_rollup_circuit();
    }

    #[test(should_fail_with = "input proofs have different constants")]
    fn constants_different_chain_id_fails() {
        let mut inputs = default_merge_rollup_inputs();
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants.global_variables.chain_id =
            1;
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants.global_variables.chain_id =
            0;
        let _output = inputs.merge_rollup_circuit();
    }

    #[test(should_fail_with = "input proofs have different note hash tree snapshots")]
    fn previous_rollups_dont_follow_note_hash() {
        let mut inputs = default_merge_rollup_inputs();
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end.note_hash_tree.root =
            0;
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.note_hash_tree.root =
            1;
        let _output = inputs.merge_rollup_circuit();
    }

    #[test(should_fail_with = "input proofs have different nullifier tree snapshots")]
    fn previous_rollups_dont_follow_nullifier() {
        let mut inputs = default_merge_rollup_inputs();
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end.nullifier_tree.root =
            0;
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.nullifier_tree.root =
            1;
        let _output = inputs.merge_rollup_circuit();
    }

    #[test(should_fail_with = "input proofs have different blob data sponges")]
    fn previous_rollups_dont_follow_sponge() {
        let mut inputs = default_merge_rollup_inputs();
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_sponge_blob.sponge.state[0] =
            0;
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start_sponge_blob.sponge.state[0] =
            1;
        let _output = inputs.merge_rollup_circuit();
    }

    #[test]
    fn rollup_fields_are_set_correctly() {
        let mut inputs = default_merge_rollup_inputs();
        let mut outputs = inputs.merge_rollup_circuit();
        assert_eq(outputs.num_txs, 2);

        // set inputs to have a merge rollup type and set the rollup height and test again.
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.num_txs = 2;
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.num_txs = 2;

        outputs = inputs.merge_rollup_circuit();
        assert_eq(outputs.num_txs, 4);
    }

    #[test]
    fn tx_subtrees_are_set_correctly() {
        let mut inputs = default_merge_rollup_inputs();
        let mut outputs = inputs.merge_rollup_circuit();
        // Start with two bases => two single txs
        assert_eq(outputs.num_txs, 2);
        // Test one merge of 2 merged with one base
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.num_txs = 2;
        outputs = inputs.merge_rollup_circuit();
        // Should have one subtree of size 2, and one of size 1
        assert_eq(outputs.num_txs, 3);
        // Test two merges, each with a subtree of 2
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.num_txs = 2;
        outputs = inputs.merge_rollup_circuit();
        // Should have one subtree of size 4
        assert_eq(outputs.num_txs, 4);

        // Test two merges, one with a subtree of 16, one with subtrees of 4 and 1
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.num_txs = 16;
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.num_txs = 5;
        outputs = inputs.merge_rollup_circuit();
        assert_eq(outputs.num_txs, 21);
    }

    #[test]
    fn start_and_end_partial_states() {
        let mut inputs = default_merge_rollup_inputs();
        let outputs = inputs.merge_rollup_circuit();

        assert(outputs.start.eq(
            inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start,
        ));
        assert(outputs.end.eq(inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end));
    }

    #[test]
    fn txs_effects_sponge() {
        let mut inputs = default_merge_rollup_inputs();
        let outputs = inputs.merge_rollup_circuit();
        let mut expected_sponge = outputs.start_sponge_blob;
        expected_sponge.absorb([1, 2], 2);

        assert_eq(outputs.end_sponge_blob, expected_sponge);
    }

    #[test]
    fn constants_dont_change() {
        let mut inputs = default_merge_rollup_inputs();
        let outputs = inputs.merge_rollup_circuit();

        assert(inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants.eq(
            outputs.constants,
        ));
        assert(inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants.eq(
            outputs.constants,
        ));
    }

    #[test]
    fn valid_previous_circuit_base() {
        let mut inputs = default_merge_rollup_inputs();

        let vk_index = PRIVATE_BASE_ROLLUP_VK_INDEX;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            fixtures::vk_tree::VK_MERKLE_TREE;
        inputs.previous_rollup_data[0].vk_data.vk =
            fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        inputs.previous_rollup_data[0].vk_data.leaf_index = vk_index;
        inputs.previous_rollup_data[0].vk_data.sibling_path = vk_tree.get_sibling_path(vk_index);

        let _outputs = inputs.merge_rollup_circuit();
    }

    #[test]
    fn valid_previous_circuit_merge() {
        let mut inputs = default_merge_rollup_inputs();

        let vk_index = MERGE_ROLLUP_INDEX;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            fixtures::vk_tree::VK_MERKLE_TREE;
        inputs.previous_rollup_data[0].vk_data.vk =
            fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        inputs.previous_rollup_data[0].vk_data.leaf_index = vk_index;
        inputs.previous_rollup_data[0].vk_data.sibling_path = vk_tree.get_sibling_path(vk_index);

        let _outputs = inputs.merge_rollup_circuit();
    }

    #[test(should_fail_with = "Invalid vk index")]
    fn invalid_previous_circuit() {
        let mut inputs = default_merge_rollup_inputs();

        let vk_index = ROOT_PARITY_INDEX;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            fixtures::vk_tree::VK_MERKLE_TREE;
        inputs.previous_rollup_data[0].vk_data.vk =
            fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        inputs.previous_rollup_data[0].vk_data.leaf_index = vk_index;
        inputs.previous_rollup_data[0].vk_data.sibling_path = vk_tree.get_sibling_path(vk_index);

        let _outputs = inputs.merge_rollup_circuit();
    }
}
