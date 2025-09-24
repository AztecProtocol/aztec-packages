use crate::{abis::BlockRollupPublicInputs, block_merge::validate_consecutive_block_rollups};
use types::{
    abis::{block_header::BlockHeader, sponge_blob::SpongeBlob},
    constants::{ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
    merkle_tree::check_membership,
    proof::proof_data::RollupHonkProofData,
    traits::Hash,
};

pub struct CheckpointRootInputsValidator<let NumPreviousRollups: u32, let NumVkIndices: u32> {
    previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; NumPreviousRollups],
    allowed_previous_vk_indices: [u32; NumVkIndices],
    previous_block_header: BlockHeader,
    previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl<let NumPreviousRollups: u32, let NumVkIndices: u32> CheckpointRootInputsValidator<NumPreviousRollups, NumVkIndices> {
    pub fn new(
        previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; NumPreviousRollups],
        allowed_previous_vk_indices: [u32; NumVkIndices],
        previous_block_header: BlockHeader,
        previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    ) -> Self {
        CheckpointRootInputsValidator {
            previous_rollups,
            allowed_previous_vk_indices,
            previous_block_header,
            previous_archive_sibling_path,
        }
    }

    pub fn validate(self) {
        self.validate_previous_rollup_proofs_and_vks();

        for i in 1..NumPreviousRollups {
            validate_consecutive_block_rollups(
                self.previous_rollups[i - 1].public_inputs,
                self.previous_rollups[i].public_inputs,
            );
        }

        self.validate_start_states();

        self.validate_end_states();
    }

    fn validate_previous_rollup_proofs_and_vks(self) {
        if !dep::std::runtime::is_unconstrained() {
            for i in 0..NumPreviousRollups {
                self.previous_rollups[i].verify_proof();
            }
        }

        let vk_tree_root = self.previous_rollups[0].public_inputs.constants.vk_tree_root;
        for i in 0..NumPreviousRollups {
            self.previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
                vk_tree_root,
                self.allowed_previous_vk_indices,
            );
        }
    }

    fn validate_start_states(self) {
        let first_rollup = self.previous_rollups[0].public_inputs;

        // Asserts that the first sponge blob was empty to begin with.
        // This prevents injecting unexpected tx effects via the first tx_base of a checkpoint.
        let expected_start_sponge_blob =
            SpongeBlob::new(first_rollup.start_sponge_blob.expected_fields);
        assert_eq(
            first_rollup.start_sponge_blob,
            expected_start_sponge_blob,
            "The start blob sponge was not empty",
        );

        assert_eq(
            first_rollup.start_state,
            self.previous_block_header.state,
            "The start state of the checkpoint does not match the state in the previous block header",
        );

        assert(
            first_rollup.start_timestamp > self.previous_block_header.global_variables.timestamp,
            "The start timestamp must be after the previous block's timestamp",
        );

        // `previous_block_header` is provided as a private input and is used to validate the values above.
        // Here we make sure it's indeed the header of the previous block by checking it against the previous archive.
        // The previous archive will be validated on L1.
        self.validate_previous_block_header_in_archive();
    }

    /// Check that the hash of the previous block header is the last leaf in the previous archive.
    fn validate_previous_block_header_in_archive(self) {
        let previous_archive = self.previous_rollups[0].public_inputs.previous_archive;
        let last_leaf_index = previous_archive.next_available_leaf_index - 1;
        let previous_block_hash = self.previous_block_header.hash();

        assert(
            check_membership(
                previous_block_hash,
                last_leaf_index as Field,
                self.previous_archive_sibling_path,
                previous_archive.root,
            ),
            "Hash of the previous block header is not the last leaf in the archive tree",
        );
    }

    fn validate_end_states(self) {
        let end_sponge_blob =
            self.previous_rollups[NumPreviousRollups - 1].public_inputs.end_sponge_blob;

        // Check that the number of absorbed blob fields is not larger than the maximum number of fields allowed.
        assert(
            end_sponge_blob.expected_fields <= FIELDS_PER_BLOB * BLOBS_PER_BLOCK,
            "Attempted to overfill blobs",
        );

        // Check that the sponge blob has absorbed all the fields it expected to.
        assert_eq(
            end_sponge_blob.expected_fields,
            end_sponge_blob.fields,
            "Mismatched expected and actual number of blob fields",
        );

        // The `end_sponge_blob` is validated against the injected blob fields in `checkpoint_rollup_public_inputs_composer.nr`
        // where we receive the hash of the blob fields from batching and use it to check against the hash of the
        // `end_sponge_blob`.
    }
}
