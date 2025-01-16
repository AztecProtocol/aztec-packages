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
use types::constants::{
    MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootRollupInputs {
    previous_rollup_data: [PreviousRollupData; 2],
    data: BlockRootRollupData,
}

impl BlockRootRollupInputs {
    pub fn block_root_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        let validator = BlockRootRollupInputsValidator::new(
            self.previous_rollup_data,
            ALLOWED_PREVIOUS_CIRCUITS,
            self.data.l1_to_l2_roots,
        );
        validator.validate();

        let previous_rollups = [
            self.previous_rollup_data[0].base_or_merge_rollup_public_inputs,
            self.previous_rollup_data[1].base_or_merge_rollup_public_inputs,
        ];
        let composer =
            BlockRootRollupOutputComposer::new_from_two_rollups(previous_rollups, self.data);
        composer.finish()
    }
}

pub(crate) mod tests {
    use crate::{
        abis::{
            block_root_or_block_merge_public_inputs::{
                BlockRootOrBlockMergePublicInputs, FeeRecipient,
            },
            block_root_rollup_data::BlockRootRollupData,
            previous_rollup_data::PreviousRollupData,
        },
        block_root::block_root_rollup_inputs::BlockRootRollupInputs,
        tests::{
            l1_to_l2_roots::default_root_rollup_parity_input,
            previous_rollup_data::default_previous_rollup_data,
        },
    };
    use blob::blob_public_inputs::{BlobCommitment, BlockBlobPublicInputs};
    use std::hash::poseidon2::Poseidon2;
    use std::test::OracleMock;
    use types::{
        abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        constants::{
            ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB, L1_TO_L2_MSG_SUBTREE_HEIGHT,
            L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, L1_TO_L2_MSG_TREE_HEIGHT,
        },
        hash::accumulate_sha256,
        tests::{merkle_tree_utils::compute_zero_hashes, utils::assert_array_eq},
        traits::Empty,
        utils::arrays::array_concat,
    };

    fn compute_l1_l2_empty_snapshot() -> (AppendOnlyTreeSnapshot, [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH]) {
        let zero_hashes = compute_zero_hashes([0; L1_TO_L2_MSG_TREE_HEIGHT]);
        let mut l1_to_l2_message_subtree_sibling_path =
            [0; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH];

        for i in 0..L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH {
            let index = L1_TO_L2_MSG_SUBTREE_HEIGHT + i - 1;
            l1_to_l2_message_subtree_sibling_path[i] = zero_hashes[index];
        }

        (
            AppendOnlyTreeSnapshot {
                root: zero_hashes[zero_hashes.len() - 1],
                next_available_leaf_index: 0,
            }, l1_to_l2_message_subtree_sibling_path,
        )
    }

    fn compute_archive_snapshot() -> (AppendOnlyTreeSnapshot, [Field; ARCHIVE_HEIGHT]) {
        let zero_hashes = compute_zero_hashes([0; ARCHIVE_HEIGHT]);
        let mut sibling_path = [0; ARCHIVE_HEIGHT];
        for i in 1..ARCHIVE_HEIGHT {
            sibling_path[i] = zero_hashes[i - 1];
        }
        (
            AppendOnlyTreeSnapshot {
                root: zero_hashes[zero_hashes.len() - 1],
                next_available_leaf_index: 0,
            }, sibling_path,
        )
    }

    pub struct TestBuilder {
        pub previous_rollup_data: [PreviousRollupData; 2],
        pub data: BlockRootRollupData,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            TestBuilder::new_with_blobs_fields([1], [2])
        }

        pub fn new_with_blobs_fields<let N: u32, let M: u32>(
            blob_fields_0: [Field; N],
            blob_fields_1: [Field; M],
        ) -> Self {
            let mut previous_rollup_data =
                default_previous_rollup_data(blob_fields_0, blob_fields_1);

            let l1_to_l2_roots = default_root_rollup_parity_input();

            let (l1_l2_empty_snapshot, l1_l2_empty_sibling_path) = compute_l1_l2_empty_snapshot();

            let (archive_snapshot, archive_sibling_path) = compute_archive_snapshot();
            previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants.last_archive =
                archive_snapshot;
            previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants.last_archive =
                archive_snapshot;

            let mut padded_blobs_fields = [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
            for i in 0..N {
                padded_blobs_fields[i] = blob_fields_0[i];
            }
            for i in 0..M {
                padded_blobs_fields[N + i] = blob_fields_1[i];
            }

            let mut blob_commitments = [BlobCommitment::empty(); BLOBS_PER_BLOCK];
            blob_commitments[0] = BlobCommitment { inner: [31, 75] };

            previous_rollup_data[0].base_or_merge_rollup_public_inputs.accumulated_fees = 12;
            previous_rollup_data[1].base_or_merge_rollup_public_inputs.accumulated_fees = 34;

            let data = BlockRootRollupData {
                l1_to_l2_roots,
                l1_to_l2_message_subtree_sibling_path: l1_l2_empty_sibling_path,
                start_l1_to_l2_message_tree_snapshot: l1_l2_empty_snapshot,
                new_archive_sibling_path: archive_sibling_path,
                previous_block_hash: 567,
                prover_id: 0,
                blobs_fields: padded_blobs_fields,
                blob_commitments,
                blobs_hash: 8901,
            };
            TestBuilder { previous_rollup_data, data }
        }

        pub fn mock_evaluate_blobs(self) -> Self {
            /// Safety: This is a mock for testing only
            unsafe {
                let _ = OracleMock::mock("evaluateBlobs").returns(BlockBlobPublicInputs::empty());
            }
            self
        }

        pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
            BlockRootRollupInputs {
                previous_rollup_data: self.previous_rollup_data,
                data: self.data,
            }
                .block_root_rollup_circuit()
        }
    }

    #[test]
    unconstrained fn correct_block_root_rollup_output() {
        let builder = TestBuilder::new().mock_evaluate_blobs();

        let output = builder.execute();

        let left_rollup = builder.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        let right_rollup = builder.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

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
        let expected_z = 0x1f92b871671f27a378d23f1cef10fbd8f0d90dd7172da9e3c3fc1aa745a072c3;

        let mut builder = TestBuilder::new_with_blobs_fields(blob_fields_0, blob_fields_1);
        builder.data.blob_commitments[0].inner = expected_blob_commitment;
        builder.data.blobs_hash = expected_blobs_hash;

        let output = builder.execute();

        let start_sponge_blob =
            builder.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob;
        let end_sponge_blob =
            builder.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_sponge_blob;
        let blobs_fields = array_concat(blob_fields_0, blob_fields_1);
        let mut expected_sponge = start_sponge_blob;
        expected_sponge.absorb(blobs_fields, blobs_fields.len());
        assert(!end_sponge_blob.eq(start_sponge_blob));
        assert(end_sponge_blob.eq(expected_sponge));

        let hashed_tx_effects = expected_sponge.squeeze();
        let computed_z = Poseidon2::hash(
            [hashed_tx_effects, expected_blob_commitment[0], expected_blob_commitment[1]],
            3,
        );
        assert_eq(computed_z, expected_z);
        assert_eq(output.blob_public_inputs[0].inner[0].z, expected_z);
        assert_eq(
            output.blob_public_inputs[0].inner[0].kzg_commitment.inner,
            expected_blob_commitment,
        );
    }

    #[test(should_fail_with = "block's first blob sponge was not empty")]
    unconstrained fn non_empty_start_blob_fails() {
        let mut builder = TestBuilder::new();

        builder.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob.fields =
            1;

        let _ = builder.execute();
    }
}
