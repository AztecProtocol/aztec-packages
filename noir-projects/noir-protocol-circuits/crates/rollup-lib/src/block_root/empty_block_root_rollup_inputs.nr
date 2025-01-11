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
use blob::blob_public_inputs::BlobCommitment;
use parity_lib::root::root_rollup_parity_input::RootRollupParityInput;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, constant_rollup_data::ConstantRollupData,
    },
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    },
    partial_state_reference::PartialStateReference,
};

pub global EMPTY_BLOBS_HASH: Field =
    0x001cedbd7ea5309ef9d1d159209835409bf41b6b1802597a52fa70cc82e934d9;
pub global EMPTY_BLOB_COMMITMENT: [Field; 2] =
    [0x00c0000000000000000000000000000000000000000000000000000000000000, 0];
pub global EMPTY_BLOB_CHALLENGE_Z: Field =
    0x0ac4f3ee53aedc4865073ae7fb664e7401d10eadbe3bbcc266c35059f14826bb;

pub struct EmptyBlockRootRollupInputs {
    l1_to_l2_roots: RootRollupParityInput,
    l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    start_l1_to_l2_message_tree_snapshot: AppendOnlyTreeSnapshot,
    // Hint for updating the archive tree.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    // Added previous_block_hash to be passed through to the final root, where it will be either:
    // - checked on L1 for first block in batch
    // - checked against previous block_root.end_block_hash in a block_merge
    previous_block_hash: Field,
    previous_partial_state: PartialStateReference,
    constants: ConstantRollupData,
    // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
    prover_id: Field,
    // This is set to true for situation where there's only 1 block in an epoch and we need another block root as the
    // right child of the root rollup.
    is_padding: bool,
}

impl EmptyBlockRootRollupInputs {
    pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
        let validator = BlockRootRollupInputsValidator::new(
            [], // previous_rollup_data
            [], // allowed_vk_indices
            self.l1_to_l2_roots,
        );
        validator.validate_without_previous_rollups(self.is_padding);

        let mut blob_commitments = [BlobCommitment::empty(); BLOBS_PER_BLOCK];
        blob_commitments[0].inner = EMPTY_BLOB_COMMITMENT;

        let data = BlockRootRollupData {
            l1_to_l2_roots: self.l1_to_l2_roots,
            l1_to_l2_message_subtree_sibling_path: self.l1_to_l2_message_subtree_sibling_path,
            start_l1_to_l2_message_tree_snapshot: self.start_l1_to_l2_message_tree_snapshot,
            new_archive_sibling_path: self.new_archive_sibling_path,
            previous_block_hash: self.previous_block_hash,
            prover_id: self.prover_id,
            blobs_fields: [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
            blob_commitments,
            blobs_hash: EMPTY_BLOBS_HASH,
        };

        let composer = BlockRootRollupOutputComposer::new_from_empty_rollup(data);
        composer.finish_empty(
            self.constants,
            self.previous_partial_state,
            EMPTY_BLOB_CHALLENGE_Z,
            self.is_padding,
        )
    }
}

mod tests {
    use crate::{
        abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        block_root::empty_block_root_rollup_inputs::{
            EMPTY_BLOB_CHALLENGE_Z, EMPTY_BLOB_COMMITMENT, EMPTY_BLOBS_HASH,
            EmptyBlockRootRollupInputs,
        },
        tests::l1_to_l2_roots::default_root_rollup_parity_input,
    };
    use std::hash::poseidon2::Poseidon2;
    use types::{
        abis::{
            append_only_tree_snapshot::AppendOnlyTreeSnapshot,
            constant_rollup_data::ConstantRollupData, sponge_blob::SpongeBlob,
        },
        constants::{
            ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
            L1_TO_L2_MSG_TREE_HEIGHT,
        },
        partial_state_reference::PartialStateReference,
        tests::{merkle_tree_utils::compute_zero_hashes, utils::assert_array_eq},
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
        inputs: EmptyBlockRootRollupInputs,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let l1_to_l2_roots = default_root_rollup_parity_input();

            let (l1_l2_empty_snapshot, l1_l2_empty_sibling_path) = compute_l1_l2_empty_snapshot();

            let (archive_snapshot, archive_sibling_path) = compute_archive_snapshot();

            let previous_partial_state = PartialStateReference::empty();

            let mut constants = ConstantRollupData::empty();
            constants.last_archive = archive_snapshot;

            let inputs = EmptyBlockRootRollupInputs {
                l1_to_l2_roots,
                l1_to_l2_message_subtree_sibling_path: l1_l2_empty_sibling_path,
                start_l1_to_l2_message_tree_snapshot: l1_l2_empty_snapshot,
                new_archive_sibling_path: archive_sibling_path,
                previous_block_hash: 3456,
                previous_partial_state,
                constants,
                prover_id: 0,
                is_padding: false,
            };

            TestBuilder { inputs }
        }

        pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
            self.inputs.execute()
        }
    }

    #[test]
    unconstrained fn correct_empty_block_root_rollup_output_for_block() {
        let builder = TestBuilder::new();

        let output = builder.execute();

        assert(output.previous_archive != output.new_archive);
        assert(output.previous_block_hash != output.end_block_hash);
        assert_eq(output.start_global_variables, output.end_global_variables);
        assert_eq(output.out_hash, 0);
        assert_array_eq(output.fees, []);

        // The below values are generated from block_building_helper.test.ts.
        let expected_empty_blobs_hash =
            0x001cedbd7ea5309ef9d1d159209835409bf41b6b1802597a52fa70cc82e934d9;
        let expected_empty_blob_commitment =
            [0x00c0000000000000000000000000000000000000000000000000000000000000, 0];
        let expected_z = 0x0ac4f3ee53aedc4865073ae7fb664e7401d10eadbe3bbcc266c35059f14826bb;

        assert_eq(expected_empty_blobs_hash, EMPTY_BLOBS_HASH);
        assert_eq(expected_empty_blob_commitment, EMPTY_BLOB_COMMITMENT);
        assert_eq(expected_z, EMPTY_BLOB_CHALLENGE_Z);

        let mut expected_sponge = SpongeBlob::new(0);
        let hashed_tx_effects = expected_sponge.squeeze();
        let computed_z = Poseidon2::hash(
            [
                hashed_tx_effects,
                expected_empty_blob_commitment[0],
                expected_empty_blob_commitment[1],
            ],
            3,
        );
        assert_eq(computed_z, expected_z);
        assert_eq(output.blob_public_inputs[0].inner[0].z, expected_z);
        assert_eq(
            output.blob_public_inputs[0].inner[0].kzg_commitment.inner,
            expected_empty_blob_commitment,
        );
    }

    #[test]
    unconstrained fn correct_empty_block_root_rollup_output_for_padding() {
        let mut builder = TestBuilder::new();
        builder.inputs.is_padding = true;

        let output = builder.execute();

        assert_eq(output.previous_archive, output.new_archive);
        assert_eq(output.previous_block_hash, output.end_block_hash);
        assert_eq(output.start_global_variables, output.end_global_variables);
        assert_eq(output.out_hash, 0);
        assert_array_eq(output.fees, []);
        assert_array_eq(output.blob_public_inputs, []);
    }
}
