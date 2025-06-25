use crate::{
    abis::{
        block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        block_root_rollup_data::BlockRootRollupData,
    },
    block_root::components::{
        block_root_rollup_inputs_validator::BlockRootRollupInputsValidator,
        block_root_rollup_output_composer::BlockRootRollupOutputComposer,
    },
};
use blob::blob_batching_public_inputs::{BatchingBlobCommitment, BlobAccumulationInputs};
use types::{abis::block_constant_data::BlockConstantData, traits::Empty};

pub global EMPTY_EFFECT_BLOBS_HASH: Field =
    0x001cedbd7ea5309ef9d1d159209835409bf41b6b1802597a52fa70cc82e934d9;
pub global EMPTY_EFFECT_BLOB_COMMITMENT: BatchingBlobCommitment =
    BatchingBlobCommitment::empty_blob();
pub global EMPTY_EFFECT_BLOB_CHALLENGE_Z: Field =
    0x0ac4f3ee53aedc4865073ae7fb664e7401d10eadbe3bbcc266c35059f14826bb;

pub struct EmptyBlockRootRollupInputs {
    data: BlockRootRollupData,
    constants: BlockConstantData,
    // This is set to true for situation where there's only 1 block in an epoch and we need another block root as the
    // right child of the root rollup.
    is_padding: bool,
}

impl EmptyBlockRootRollupInputs {
    pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
        let validator = BlockRootRollupInputsValidator::new(
            [], // previous_rollup_data
            [], // allowed_vk_indices
            self.data,
        );
        validator.validate_without_previous_rollups(self.is_padding, self.constants);

        let mut blob_accumulation_input = BlobAccumulationInputs::empty();
        blob_accumulation_input.z_i = EMPTY_EFFECT_BLOB_CHALLENGE_Z;

        blob_accumulation_input.c_i = EMPTY_EFFECT_BLOB_COMMITMENT;
        let composer = BlockRootRollupOutputComposer::new_from_empty_rollup(self.data);
        composer.finish_empty(
            self.constants,
            EMPTY_EFFECT_BLOBS_HASH,
            blob_accumulation_input,
            self.is_padding,
        )
    }
}

mod tests {
    use crate::{
        abis::block_root_or_block_merge_public_inputs::{
            BlockRootOrBlockMergePublicInputs, FeeRecipient,
        },
        block_root::empty_block_root_rollup_inputs::{
            EMPTY_EFFECT_BLOB_CHALLENGE_Z, EMPTY_EFFECT_BLOB_COMMITMENT, EMPTY_EFFECT_BLOBS_HASH,
            EmptyBlockRootRollupInputs,
        },
        tests::rollup_fixture_builder::RollupFixtureBuilder,
    };
    use bigint::BigNum;
    use types::{
        abis::sponge_blob::SpongeBlob, address::EthAddress, hash::poseidon2_hash,
        tests::utils::assert_array_eq,
    };

    pub struct TestBuilder {
        pub inputs: RollupFixtureBuilder,
        pub is_padding: bool,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let inputs = RollupFixtureBuilder::new_for_block_root();
            TestBuilder { inputs, is_padding: false }
        }

        pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
            EmptyBlockRootRollupInputs {
                data: self.inputs.to_block_root_rollup_data(),
                constants: self.inputs.to_block_constant_data(),
                is_padding: self.is_padding,
            }
                .execute()
        }
    }

    #[test]
    unconstrained fn correct_empty_block_root_rollup_output_for_block() {
        let builder = TestBuilder::new();

        let output = builder.execute();

        assert(output.previous_archive != output.new_archive);
        assert_eq(output.start_global_variables, output.end_global_variables);
        assert_eq(output.out_hash, 0);
        assert_array_eq(
            output.fees,
            [FeeRecipient { recipient: builder.inputs.global_variables.coinbase, value: 0 }],
        );

        // The below values are generated from block_building_helper.test.ts.
        let expected_empty_effect_blobs_hash =
            0x001cedbd7ea5309ef9d1d159209835409bf41b6b1802597a52fa70cc82e934d9;
        let expected_empty_effect_blob_commitment_fields =
            [0x00c0000000000000000000000000000000000000000000000000000000000000, 0];
        let expected_empty_effect_challenge_z =
            0x0ac4f3ee53aedc4865073ae7fb664e7401d10eadbe3bbcc266c35059f14826bb;

        assert_eq(expected_empty_effect_blobs_hash, EMPTY_EFFECT_BLOBS_HASH);
        assert_eq(
            expected_empty_effect_blob_commitment_fields,
            EMPTY_EFFECT_BLOB_COMMITMENT.to_compressed_fields(),
        );
        assert_eq(expected_empty_effect_challenge_z, EMPTY_EFFECT_BLOB_CHALLENGE_Z);

        let mut expected_sponge = SpongeBlob::new(0);
        let hashed_tx_effects = expected_sponge.squeeze();
        let computed_z = poseidon2_hash([
            hashed_tx_effects,
            expected_empty_effect_blob_commitment_fields[0],
            expected_empty_effect_blob_commitment_fields[1],
        ]);

        assert_eq(computed_z, EMPTY_EFFECT_BLOB_CHALLENGE_Z);
        assert_eq(
            output.blob_public_inputs.end_blob_accumulator.z_acc,
            EMPTY_EFFECT_BLOB_CHALLENGE_Z,
        );
        assert_eq(
            output.blob_public_inputs.end_blob_accumulator.c_acc,
            EMPTY_EFFECT_BLOB_COMMITMENT.point,
        );
        assert_eq(output.blob_public_inputs.end_blob_accumulator.y_acc.get_limbs(), [0, 0, 0]);
    }

    #[test]
    unconstrained fn correct_empty_block_root_rollup_output_for_padding() {
        let mut builder = TestBuilder::new();
        builder.is_padding = true;
        builder.inputs.global_variables.coinbase = EthAddress::from_field(0);

        let output = builder.execute();

        assert_eq(output.previous_archive, output.new_archive);
        assert_eq(output.start_global_variables, output.end_global_variables);
        assert_eq(output.out_hash, 0);
        assert_eq(
            output.blob_public_inputs.start_blob_accumulator,
            output.blob_public_inputs.end_blob_accumulator,
        );
        assert_array_eq(output.fees, []);
    }

    #[test(should_fail_with = "hash of the previous block header is not the last leaf in the archive tree")]
    unconstrained fn random_previous_block_header_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_block_header.state.partial.note_hash_tree.root += 1;

        let _ = builder.execute();
    }
}
