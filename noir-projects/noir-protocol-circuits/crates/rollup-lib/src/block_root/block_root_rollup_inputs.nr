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
use types::constants::{
    MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootRollupInputs {
    previous_rollup_data: [PreviousRollupData; 2],
    data: BlockRootRollupData,
    blob_data: BlockRootRollupBlobData,
}

impl BlockRootRollupInputs {
    pub fn block_root_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        BlockRootRollupInputsValidator::new(
            self.previous_rollup_data,
            ALLOWED_PREVIOUS_CIRCUITS,
            self.data.l1_to_l2_roots,
            self.data.previous_block_header,
        )
            .validate();

        let previous_rollups = [
            self.previous_rollup_data[0].base_or_merge_rollup_public_inputs,
            self.previous_rollup_data[1].base_or_merge_rollup_public_inputs,
        ];
        BlockRootRollupOutputComposer::new_from_two_rollups(previous_rollups, self.data).finish(
            self.blob_data,
        )
    }
}

pub(crate) mod tests {
    use crate::{
        abis::block_root_or_block_merge_public_inputs::{
            BlockRootOrBlockMergePublicInputs, FeeRecipient,
        },
        block_root::block_root_rollup_inputs::BlockRootRollupInputs,
        tests::rollup_fixture_builder::RollupFixtureBuilder,
    };
    use std::hash::poseidon2::Poseidon2;
    use types::{
        hash::accumulate_sha256, tests::utils::assert_array_eq, utils::arrays::array_concat,
    };

    pub struct TestBuilder {
        pub inputs: RollupFixtureBuilder,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let inputs = RollupFixtureBuilder::new_for_block_root();
            inputs.mock_evaluate_blobs();
            TestBuilder { inputs }
        }

        pub fn new_with_blobs_fields<let N: u32, let M: u32>(
            blob_fields_0: [Field; N],
            blob_fields_1: [Field; M],
        ) -> Self {
            let inputs = RollupFixtureBuilder::new_for_block_root().with_blobs_fields(
                blob_fields_0,
                blob_fields_1,
            );
            TestBuilder { inputs }
        }

        pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
            BlockRootRollupInputs {
                previous_rollup_data: self.inputs.previous_rollup_data,
                data: self.inputs.to_block_root_rollup_data(),
                blob_data: self.inputs.to_block_root_rollup_blob_data(),
            }
                .block_root_rollup_circuit()
        }
    }

    #[test]
    unconstrained fn correct_block_root_rollup_output() {
        let builder = TestBuilder::new();

        let output = builder.execute();

        let left_rollup = builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        let right_rollup =
            builder.inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

        assert_eq(output.previous_archive, left_rollup.constants.last_archive);
        assert(output.new_archive != output.previous_archive);
        assert_eq(output.start_global_variables, left_rollup.constants.global_variables);
        assert_eq(output.end_global_variables, left_rollup.constants.global_variables);

        let expected_out_hash = accumulate_sha256([left_rollup.out_hash, right_rollup.out_hash]);
        assert_eq(output.out_hash, expected_out_hash);

        let expected_fee = FeeRecipient {
            recipient: left_rollup.constants.global_variables.coinbase,
            value: left_rollup.accumulated_fees + right_rollup.accumulated_fees,
        };
        assert_array_eq(output.fees, [expected_fee]);
    }

    #[test]
    fn correct_blob_with_non_empty_fields() {
        // Note: this test will not run in unconstrained, because it reaches the foreign call
        // TODO(#10323): remove the oracle and switch this test to unconstrained

        // The below values are generated from block_building_helper.test.ts.
        let blob_fields_0 = [
            0x000000000000000000000000000000000074785f737461727400000500010000,
            0x000000000000000000000000000000000000000000000000000000000000002a,
            0x0002000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000004000001,
            0x0000000000000000000000000000000000000000000000000000000000000123,
        ];
        let blob_fields_1 = [
            0x000000000000000000000000000000000074785f737461727400000700010000,
            0x000000000000000000000000000000000000000000000000000000000000002b,
            0x0002000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000003000001,
            0x0000000000000000000000000000000000000000000000000000000000006789,
            0x0000000000000000000000000000000000000000000000000000000004000001,
            0x0000000000000000000000000000000000000000000000000000000000000045,
        ];
        let expected_blob_commitment = [
            0x008c32fe581c8fdba12c0d7597911dead2d937d68525bae655508412bb53bb98,
            0x0000000000000000000000000000006aaa0680f21270e7d8de4e19da5164f95c,
        ];
        let expected_blobs_hash =
            0x00a965619c8668b834755678b32d023b9c5e8588ce449f44f7fa9335455b5cc5;
        let expected_challenge_z =
            0x1f92b871671f27a378d23f1cef10fbd8f0d90dd7172da9e3c3fc1aa745a072c3;

        let mut builder = TestBuilder::new_with_blobs_fields(blob_fields_0, blob_fields_1);
        builder.inputs.blob_commitments[0].inner = expected_blob_commitment;
        builder.inputs.blobs_hash = expected_blobs_hash;

        let output = builder.execute();

        let start_sponge_blob = builder.inputs.previous_rollup_data[0]
            .base_or_merge_rollup_public_inputs
            .start_sponge_blob;
        let end_sponge_blob = builder.inputs.previous_rollup_data[1]
            .base_or_merge_rollup_public_inputs
            .end_sponge_blob;
        let blobs_fields = array_concat(blob_fields_0, blob_fields_1);
        let mut expected_sponge = start_sponge_blob;
        expected_sponge.absorb(blobs_fields, blobs_fields.len());
        assert(!end_sponge_blob.eq(start_sponge_blob));
        assert(end_sponge_blob.eq(expected_sponge));

        let hashed_tx_effects = expected_sponge.squeeze();
        let computed_challenge_z = Poseidon2::hash(
            [hashed_tx_effects, expected_blob_commitment[0], expected_blob_commitment[1]],
            3,
        );
        assert_eq(computed_challenge_z, expected_challenge_z);
        assert_eq(output.blob_public_inputs[0].inner[0].z, expected_challenge_z);
        assert_eq(
            output.blob_public_inputs[0].inner[0].kzg_commitment.inner,
            expected_blob_commitment,
        );
    }

    #[test(should_fail_with = "block's first blob sponge was not empty")]
    unconstrained fn non_empty_start_blob_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob.fields =
            1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "the start state of the block's first tx does not match the state in previous header")]
    unconstrained fn random_block_header_for_first_tx_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.note_hash_tree.root +=
            1;

        let _ = builder.execute();
    }
}
