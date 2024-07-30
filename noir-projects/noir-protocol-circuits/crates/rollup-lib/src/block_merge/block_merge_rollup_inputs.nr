use dep::types::{traits::Empty, constants::{BASE_ROLLUP_INDEX, MERGE_ROLLUP_INDEX}};
use crate::abis::previous_rollup_block_data::PreviousRollupBlockData;
use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use crate::components;

// TODO(Miranda) handle vks
// global ALLOWED_PREVIOUS_CIRCUITS = [
//     BASE_ROLLUP_INDEX,
//     MERGE_ROLLUP_INDEX,
// ];

struct BlockMergeRollupInputs {
    previous_rollup_data : [PreviousRollupBlockData; 2]
}

impl Empty for BlockMergeRollupInputs {
    fn empty() -> Self {
        BlockMergeRollupInputs {
            previous_rollup_data: [PreviousRollupBlockData::empty(); 2]
        }
    }
}

impl BlockMergeRollupInputs {
    pub fn block_merge_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        // TODO(Lasse): Check both previous rollup vks (in previous_rollup_block_data) against the permitted set of kernel vks.
        // we don't have a set of permitted kernel vks yet.

        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify();
            // TODO(#7410) we need the tube vk to reinstate this
            // self.previous_rollup_data[0].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

            self.previous_rollup_data[1].verify();
            // TODO(#7410) we need the tube vk to reinstate this
            // self.previous_rollup_data[1].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        let left = self.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = self.previous_rollup_data[1].block_root_or_block_merge_public_inputs;

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
            fees
        }
    }
}

mod tests {
    use crate::{
        block_merge::block_merge_rollup_inputs::BlockMergeRollupInputs,
        tests::block_merge_rollup_inputs::default_block_merge_rollup_inputs
    };
    use dep::types::hash::accumulate_sha256;

    #[test(should_fail_with="input blocks have different chain id")]
    fn constants_different_chain_id_fails() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_global_variables.chain_id = 1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with="input blocks have different chain version")]
    fn constants_different_ver_fails() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_global_variables.version = 1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with="input blocks have different archive tree snapshots")]
    fn previous_rollups_dont_follow_archive() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.new_archive.root = 0;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.previous_archive.root = 1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with="input block hashes do not follow on from each other")]
    fn previous_rollups_dont_follow_block_hash() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_block_hash = 0;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.previous_block_hash = 1;
        let _output = inputs.block_merge_rollup_circuit();
    }

    #[test(should_fail_with="input block numbers do not follow on from each other")]
    fn previous_rollups_dont_follow_block_number() {
        let mut inputs = default_block_merge_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.end_global_variables.block_number = 2;
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.start_global_variables.block_number = 1;
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
    fn fees() {
        let mut inputs = default_block_merge_rollup_inputs();
        let outputs = inputs.block_merge_rollup_circuit();

        assert_eq(
            outputs.fees[0], inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.fees[0]
        );
        assert_eq(
            outputs.fees[1], inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.fees[0]
        );
    }
    // TODO(Miranda): handle vks
    // #[test]
    // fn valid_previous_circuit_base() {
    //     let mut inputs = default_merge_rollup_inputs();
    //     let vk_tree = dep::types::tests::fixtures::vk_tree::get_vk_merkle_tree();
    //     inputs.previous_rollup_data[0].vk.hash = vk_tree.leaves[BASE_ROLLUP_INDEX];
    //     inputs.previous_rollup_data[0].vk_witness.leaf_index = BASE_ROLLUP_INDEX as Field;
    //     inputs.previous_rollup_data[0].vk_witness.sibling_path = vk_tree.get_sibling_path(BASE_ROLLUP_INDEX);
    //     let _outputs = inputs.merge_rollup_circuit();
    // }
    // #[test]
    // fn valid_previous_circuit_merge() {
    //     let mut inputs = default_block_merge_rollup_inputs();
    //     let vk_tree = dep::types::tests::fixtures::vk_tree::get_vk_merkle_tree();
    //     inputs.previous_rollup_data[0].vk.hash = vk_tree.leaves[MERGE_ROLLUP_INDEX];
    //     inputs.previous_rollup_data[0].vk_witness.leaf_index = MERGE_ROLLUP_INDEX as Field;
    //     inputs.previous_rollup_data[0].vk_witness.sibling_path = vk_tree.get_sibling_path(MERGE_ROLLUP_INDEX);
    //     let _outputs = inputs.block_merge_rollup_circuit();
    // }
}
