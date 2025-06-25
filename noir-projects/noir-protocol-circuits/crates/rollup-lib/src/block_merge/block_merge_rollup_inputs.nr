use crate::{
    abis::{
        block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        previous_rollup_block_data::PreviousRollupBlockData,
    },
    block_merge::utils::{
        merge_block_rollups::merge_block_rollups,
        validate_consecutive_block_rollups::validate_consecutive_block_rollups,
    },
};
use dep::types::{
    constants::{
        BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_EMPTY_INDEX, BLOCK_ROOT_ROLLUP_INDEX,
        BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX, PROOF_TYPE_ROLLUP_HONK,
    },
    traits::Empty,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 4] = [
    BLOCK_ROOT_ROLLUP_INDEX,
    BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
    BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
    BLOCK_MERGE_ROLLUP_INDEX,
];

pub struct BlockMergeRollupInputs {
    pub previous_rollup_data: [PreviousRollupBlockData; 2],
}

impl Empty for BlockMergeRollupInputs {
    fn empty() -> Self {
        BlockMergeRollupInputs { previous_rollup_data: [PreviousRollupBlockData::empty(); 2] }
    }
}

impl BlockMergeRollupInputs {
    pub fn block_merge_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify(PROOF_TYPE_ROLLUP_HONK);
            self.previous_rollup_data[0].validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

            self.previous_rollup_data[1].verify(PROOF_TYPE_ROLLUP_HONK);
            self.previous_rollup_data[1].validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        let left = self.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = self.previous_rollup_data[1].block_root_or_block_merge_public_inputs;

        validate_consecutive_block_rollups(left, right);

        merge_block_rollups(left, right)
    }
}

mod tests {
    use crate::tests::block_merge_rollup_inputs::default_block_merge_rollup_inputs;
    use dep::types::constants::{
        BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_INDEX, ROOT_PARITY_INDEX,
    };
    use dep::types::tests::fixtures;
    use types::merkle_tree::merkle_tree::MerkleTree;

    #[test(should_fail_with = "input blocks have different chain id")]
    fn constants_different_chain_id_fails() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_global_variables.chain_id =
            1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "input blocks have different chain version")]
    fn constants_different_ver_fails() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_global_variables.version =
            1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "input blocks have different epoch blob challenges")]
    fn blob_different_challenges_fails() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.final_blob_challenges.z +=
            1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "input blocks have different archive tree snapshots")]
    fn previous_rollups_dont_follow_archive() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.new_archive.root = 0;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.previous_archive.root =
            1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "input block numbers do not follow on from each other")]
    fn previous_rollups_dont_follow_block_number() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.start_global_variables.block_number =
            3;
        // Need to change the end block number to match the start block number so that the number of blocks is 1.
        // This is to form a balanced tree with previous_rollup_data[0], whose number of blocks is 1.
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.end_global_variables.block_number =
            3;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "input block blob accumulators do not follow on from each other")]
    fn previous_rollups_dont_follow_blob_accumulator() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.z_acc +=
            1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test]
    fn block_fees_are_accumulated() {
        let mut inputs = default_block_merge_rollup_inputs();
        let outputs = inputs.block_merge_rollup_circuit();
        // TODO(Miranda): Uncomment below when fees with the same recipient are combined in merge_block_rollups.nr -> accumulate_blocks_fees()
        // // Default previous rollup inputs have the same fee recipient, so they should be accumulated into one
        // let expected_fee_total = inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.fees[0].value
        //     + inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.fees[0].value;
        // assert_eq(outputs.fees[0].value, expected_fee_total);
        // assert(is_empty(outputs.fees[1]));
        // inputs = default_block_merge_rollup_inputs();
        // // Force each previous rollup to have different fee recipients
        // inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.fees[0].recipient = EthAddress::from_field(2);
        // let outputs = inputs.block_merge_rollup_circuit();
        assert_eq(
            outputs.fees[0],
            inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.fees[0],
        );
        assert_eq(
            outputs.fees[1],
            inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.fees[0],
        );
    }

    #[test]
    fn blob_inputs_are_accumulated() {
        let mut inputs = default_block_merge_rollup_inputs();
        let outputs = inputs.block_merge_rollup_circuit();

        assert_eq(
            outputs.blob_public_inputs.start_blob_accumulator,
            inputs.previous_rollup_data[0]
                .block_root_or_block_merge_public_inputs
                .blob_public_inputs
                .start_blob_accumulator,
        );
        assert_eq(
            outputs.blob_public_inputs.end_blob_accumulator,
            inputs.previous_rollup_data[1]
                .block_root_or_block_merge_public_inputs
                .blob_public_inputs
                .end_blob_accumulator,
        );
    }

    #[test]
    fn valid_previous_circuit_block_root() {
        let mut inputs = default_block_merge_rollup_inputs();

        let vk_index = BLOCK_ROOT_ROLLUP_INDEX;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            fixtures::vk_tree::VK_MERKLE_TREE;
        inputs.previous_rollup_data[0].vk_data.vk =
            fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        inputs.previous_rollup_data[0].vk_data.leaf_index = vk_index;
        inputs.previous_rollup_data[0].vk_data.sibling_path = vk_tree.get_sibling_path(vk_index);

        let _outputs = inputs.block_merge_rollup_circuit();
    }

    #[test]
    fn valid_previous_circuit_block_merge() {
        let mut inputs = default_block_merge_rollup_inputs();

        let vk_index = BLOCK_MERGE_ROLLUP_INDEX;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            fixtures::vk_tree::VK_MERKLE_TREE;
        inputs.previous_rollup_data[0].vk_data.vk =
            fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        inputs.previous_rollup_data[0].vk_data.leaf_index = vk_index;
        inputs.previous_rollup_data[0].vk_data.sibling_path = vk_tree.get_sibling_path(vk_index);

        let _outputs = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "Invalid vk index")]
    fn invalid_previous_circuit() {
        let mut inputs = default_block_merge_rollup_inputs();

        let vk_index = ROOT_PARITY_INDEX;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            fixtures::vk_tree::VK_MERKLE_TREE;
        inputs.previous_rollup_data[0].vk_data.vk =
            fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        inputs.previous_rollup_data[0].vk_data.leaf_index = vk_index;
        inputs.previous_rollup_data[0].vk_data.sibling_path = vk_tree.get_sibling_path(vk_index);

        let _outputs = inputs.block_merge_rollup_circuit();
    }
}
