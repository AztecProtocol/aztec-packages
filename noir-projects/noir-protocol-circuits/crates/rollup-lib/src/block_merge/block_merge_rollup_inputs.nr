use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use crate::abis::previous_rollup_block_data::PreviousRollupBlockData;
use crate::components;
use dep::types::{
    constants::{
        BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_EMPTY_INDEX, BLOCK_ROOT_ROLLUP_INDEX,
        BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX, PROOF_TYPE_ROLLUP_HONK,
    },
    traits::Empty,
};
use blob::blob_batching_public_inputs::BlockBlobPublicInputs;

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

        // TODO(#15246): Constrain block rollup structure
        // For full wonkiness (no wasted proving of padding blocks for any number of blocks, but more complex hash recalculation):
        //  components::assert_blocks_filled_from_left(left, right);
        // For variable height but balanced tree (no wasted proving only for number of blocks = power of 2, simpler hash recalculation):
        //  assert(left.num_blocks == right.num_blocks)
        //  if (num_blocks == 1) { assert(vk_witness.index == BLOCK_ROOT_ROLLUP_INDEX) } else { assert(vk_witness.index == BLOCK_MERGE_ROLLUP_INDEX)}
        // ^ Where instead of num_txs, use num_blocks = (end_global_variables.block_number - start_global_variables.block_number) + 1
        components::assert_prev_block_rollups_follow_on_from_each_other(left, right);

        let proposed_block_header_hashes =
            components::accumulate_proposed_block_header_hashes(left, right);

        let fees = components::accumulate_blocks_fees(left, right);

        // Note: for blob batching, in assert_prev_block_rollups_follow_on_from_each_other we have checked:
        // - left.end_blob_accumulator == right.start_blob_accumulator
        // - left.challenge_z == right.challenge_z
        // - left.challenge_gamma == right.challenge_gamma

        let blob_public_inputs = BlockBlobPublicInputs {
            start_blob_accumulator: left.blob_public_inputs.start_blob_accumulator,
            end_blob_accumulator: right.blob_public_inputs.end_blob_accumulator,
            final_blob_challenges: left.blob_public_inputs.final_blob_challenges,
        };

        BlockRootOrBlockMergePublicInputs {
            constants: left.constants,
            previous_archive: left.previous_archive,
            new_archive: right.new_archive,
            start_global_variables: left.start_global_variables,
            end_global_variables: right.end_global_variables,
            out_hash: 0, // Not needed for block merge. This is only required for block root since the value is inserted on L1 per block.
            proposed_block_header_hashes,
            fees,
            blob_public_inputs,
        }
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
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_global_variables.block_number =
            2;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.start_global_variables.block_number =
            1;
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
        // TODO(Miranda): Uncomment below when fees are accumulated: components.nr -> accumulate_blocks_fees()
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
