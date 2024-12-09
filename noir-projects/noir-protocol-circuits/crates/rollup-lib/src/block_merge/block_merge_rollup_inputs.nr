use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use crate::abis::previous_rollup_block_data::PreviousRollupBlockData;
use crate::components;
use dep::types::{constants::{BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_INDEX}, traits::Empty};
// TODO(#7346): Currently unused! Will be used when batch rollup circuits are integrated.
global ALLOWED_PREVIOUS_CIRCUITS: [u32; 2] = [BLOCK_ROOT_ROLLUP_INDEX, BLOCK_MERGE_ROLLUP_INDEX];

pub struct BlockMergeRollupInputs {
    previous_rollup_data: [PreviousRollupBlockData; 2],
}

impl Empty for BlockMergeRollupInputs {
    fn empty() -> Self {
        BlockMergeRollupInputs { previous_rollup_data: [PreviousRollupBlockData::empty(); 2] }
    }
}

impl BlockMergeRollupInputs {
    pub fn block_merge_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        // TODO(Lasse): Check both previous rollup vks (in previous_rollup_block_data) against the permitted set of kernel vks.
        // we don't have a set of permitted kernel vks yet.
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify();
            self.previous_rollup_data[0].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

            self.previous_rollup_data[1].verify();
            self.previous_rollup_data[1].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        let left = self.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = self.previous_rollup_data[1].block_root_or_block_merge_public_inputs;

        // TODO(#7346): Constrain block rollup structure
        // For full wonkiness (no wasted proving of padding blocks for any number of blocks, but more complex hash recalculation):
        //  components::assert_blocks_filled_from_left(left, right);
        // For variable height but balanced tree (no wasted proving only for number of blocks = power of 2, simpler hash recalculation):
        //  assert(left.num_blocks == right.num_blocks)
        //  if (num_blocks == 1) { assert(vk_witness.index == BLOCK_ROOT_ROLLUP_INDEX) } else { assert(vk_witness.index == BLOCK_MERGE_ROLLUP_INDEX)}
        // ^ Where instead of num_txs, use num_blocks = (end_global_variables.block_number - start_global_variables.block_number) + 1
        components::assert_prev_block_rollups_follow_on_from_each_other(left, right);

        let out_hash = components::compute_blocks_out_hash(self.previous_rollup_data);

        let fees = components::accumulate_blocks_fees(left, right);

        BlockRootOrBlockMergePublicInputs {
            previous_archive: left.previous_archive,
            new_archive: right.new_archive,
            previous_block_hash: left.previous_block_hash,
            end_block_hash: right.end_block_hash,
            start_global_variables: left.start_global_variables,
            end_global_variables: right.end_global_variables,
            out_hash,
            fees,
            vk_tree_root: left.vk_tree_root,
            protocol_contract_tree_root: left.protocol_contract_tree_root,
            prover_id: left.prover_id, // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
        }
    }
}

mod tests {
    use crate::tests::block_merge_rollup_inputs::default_block_merge_rollup_inputs;
    use dep::types::constants::{
        BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_INDEX, ROOT_PARITY_INDEX,
    };
    use dep::types::hash::accumulate_sha256;
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

    #[test(should_fail_with = "input blocks have different archive tree snapshots")]
    fn previous_rollups_dont_follow_archive() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.new_archive.root = 0;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.previous_archive.root =
            1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "input block hashes do not follow on from each other")]
    fn previous_rollups_dont_follow_block_hash() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_block_hash = 0;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.previous_block_hash =
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

    #[test]
    fn out_hash() {
        let mut inputs = default_block_merge_rollup_inputs();
        let expected_hash = accumulate_sha256([1, 2]);
        let outputs = inputs.block_merge_rollup_circuit();

        assert_eq(outputs.out_hash, expected_hash);
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
    fn valid_previous_circuit_block_root() {
        let mut inputs = default_block_merge_rollup_inputs();
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            comptime { fixtures::vk_tree::get_vk_merkle_tree() };
        inputs.previous_rollup_data[0].vk =
            fixtures::vk_tree::generate_fake_honk_vk_for_index(BLOCK_ROOT_ROLLUP_INDEX);
        inputs.previous_rollup_data[0].vk_witness.leaf_index = BLOCK_ROOT_ROLLUP_INDEX as Field;
        inputs.previous_rollup_data[0].vk_witness.sibling_path =
            vk_tree.get_sibling_path(BLOCK_ROOT_ROLLUP_INDEX);
        let _outputs = inputs.block_merge_rollup_circuit();
    }

    #[test]
    fn valid_previous_circuit_block_merge() {
        let mut inputs = default_block_merge_rollup_inputs();
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            comptime { fixtures::vk_tree::get_vk_merkle_tree() };
        inputs.previous_rollup_data[0].vk =
            fixtures::vk_tree::generate_fake_honk_vk_for_index(BLOCK_MERGE_ROLLUP_INDEX);
        inputs.previous_rollup_data[0].vk_witness.leaf_index = BLOCK_MERGE_ROLLUP_INDEX as Field;
        inputs.previous_rollup_data[0].vk_witness.sibling_path =
            vk_tree.get_sibling_path(BLOCK_MERGE_ROLLUP_INDEX);
        let _outputs = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with = "Invalid vk index")]
    fn invalid_previous_circuit() {
        let mut inputs = default_block_merge_rollup_inputs();
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            comptime { fixtures::vk_tree::get_vk_merkle_tree() };
        inputs.previous_rollup_data[0].vk =
            fixtures::vk_tree::generate_fake_honk_vk_for_index(ROOT_PARITY_INDEX);
        inputs.previous_rollup_data[0].vk_witness.leaf_index = ROOT_PARITY_INDEX as Field;
        inputs.previous_rollup_data[0].vk_witness.sibling_path =
            vk_tree.get_sibling_path(ROOT_PARITY_INDEX);
        let _outputs = inputs.block_merge_rollup_circuit();
    }
}
