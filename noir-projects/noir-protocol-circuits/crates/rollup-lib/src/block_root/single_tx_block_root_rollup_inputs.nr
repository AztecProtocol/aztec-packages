use crate::{
    abis::{
        block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        block_root_rollup_data::BlockRootRollupData, previous_rollup_data::PreviousRollupData,
    },
    block_root::components::{
        block_root_rollup_inputs_validator::BlockRootRollupInputsValidator,
        block_root_rollup_output_composer::BlockRootRollupOutputComposer,
    },
};
use types::constants::{PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX};

// MERGE_ROLLUP_INDEX is not allowed.
global ALLOWED_PREVIOUS_CIRCUITS: [u32; 2] =
    [PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

pub struct SingleTxBlockRootRollupInputs {
    previous_rollup_data: [PreviousRollupData; 1],
    data: BlockRootRollupData,
}

impl SingleTxBlockRootRollupInputs {
    pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
        let validator = BlockRootRollupInputsValidator::new(
            self.previous_rollup_data,
            ALLOWED_PREVIOUS_CIRCUITS,
            self.data.l1_to_l2_roots,
        );
        validator.validate();

        let composer = BlockRootRollupOutputComposer::new_from_single_tx_rollup(
            self.previous_rollup_data[0].base_or_merge_rollup_public_inputs,
            self.data,
        );
        composer.finish()
    }
}

mod tests {
    use crate::block_root::{
        block_root_rollup_inputs::tests::TestBuilder,
        single_tx_block_root_rollup_inputs::SingleTxBlockRootRollupInputs,
    };

    #[test]
    unconstrained fn single_tx_block_root_rollup_output_propagated_from_base() {
        let builder = TestBuilder::new().mock_evaluate_blobs();

        let previous_rollup_data = [builder.previous_rollup_data[0]];
        let output =
            SingleTxBlockRootRollupInputs { previous_rollup_data, data: builder.data }.execute();

        let base_rollup = previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        assert_eq(output.previous_archive, base_rollup.constants.last_archive);
        assert(output.new_archive != output.previous_archive);
        assert_eq(output.start_global_variables, base_rollup.constants.global_variables);
        assert_eq(output.end_global_variables, base_rollup.constants.global_variables);
        assert_eq(output.out_hash, base_rollup.out_hash);
    }
}
