use crate::{
    abis::{
        block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        block_root_rollup_data::{BlockRootRollupBlobData, BlockRootRollupData},
        previous_rollup_data::PreviousRollupData,
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
    blob_data: BlockRootRollupBlobData,
}

impl SingleTxBlockRootRollupInputs {
    pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
        BlockRootRollupInputsValidator::new(
            self.previous_rollup_data,
            ALLOWED_PREVIOUS_CIRCUITS,
            self.data,
        )
            .validate();

        BlockRootRollupOutputComposer::new_from_single_tx_rollup(
            self.previous_rollup_data[0].base_or_merge_rollup_public_inputs,
            self.data,
        )
            .finish(self.blob_data)
    }
}

mod tests {
    use crate::{
        abis::block_root_or_block_merge_public_inputs::{
            BlockRootOrBlockMergePublicInputs, FeeRecipient,
        },
        block_root::single_tx_block_root_rollup_inputs::SingleTxBlockRootRollupInputs,
        tests::rollup_fixture_builder::RollupFixtureBuilder,
    };
    use types::tests::utils::assert_array_eq;

    pub struct TestBuilder {
        pub inputs: RollupFixtureBuilder,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let inputs = RollupFixtureBuilder::new_for_block_root();
            TestBuilder { inputs }
        }

        pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
            SingleTxBlockRootRollupInputs {
                previous_rollup_data: [self.inputs.previous_rollup_data[0]],
                data: self.inputs.to_block_root_rollup_data(),
                blob_data: self.inputs.to_block_root_rollup_blob_data(),
            }
                .execute()
        }
    }

    #[test]
    unconstrained fn single_tx_block_root_rollup_output_propagated_from_base() {
        let builder = TestBuilder::new();
        builder.inputs.mock_evaluate_blobs_and_batch();

        let output = builder.execute();

        let base_rollup = builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        assert_eq(output.previous_archive, base_rollup.constants.last_archive);
        assert(output.new_archive != output.previous_archive);
        assert_eq(output.start_global_variables, base_rollup.constants.global_variables);
        assert_eq(output.end_global_variables, base_rollup.constants.global_variables);
        assert_eq(output.out_hash, base_rollup.out_hash);

        let expected_fee = FeeRecipient {
            recipient: base_rollup.constants.global_variables.coinbase,
            value: base_rollup.accumulated_fees,
        };
        assert_array_eq(output.fees, [expected_fee]);
    }

    #[test(should_fail_with = "the start state of the block's first tx does not match the state in previous header")]
    unconstrained fn random_block_header_for_first_tx_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.note_hash_tree.root +=
            1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "hash of the previous block header is not the last leaf in the archive tree")]
    unconstrained fn random_previous_block_header_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.note_hash_tree.root +=
            1;
        builder.inputs.previous_block_header.state.partial.note_hash_tree.root += 1;

        let _ = builder.execute();
    }
}
