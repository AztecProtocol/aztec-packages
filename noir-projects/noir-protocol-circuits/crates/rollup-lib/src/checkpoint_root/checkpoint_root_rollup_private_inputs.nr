use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs},
    checkpoint_root::components::{
        CheckpointRollupPublicInputsComposer, CheckpointRootInputsValidator,
    },
};
use blob::abis::{BlobAccumulator, BLSPoint, FinalBlobBatchingChallenges};
use types::{
    abis::block_header::BlockHeader,
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, BLOCK_MERGE_ROLLUP_VK_INDEX,
        BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX, FIELDS_PER_BLOB,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 6] = [
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    BLOCK_MERGE_ROLLUP_VK_INDEX,
];

pub struct CheckpointRootRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; 2],
    pub(crate) hints: CheckpointRootRollupHints,
}

pub struct CheckpointRootRollupHints {
    // Previous block header is used to verify the start states of the checkpoint.
    // Its hash is checked against the previous archive, which will be outputted and checked against the previous
    // checkpoint, or against the value on L1 if it's the first checkpoint in the epoch.
    pub(crate) previous_block_header: BlockHeader,
    // Hint for checking that the hash of `previous_block_header` is the last leaf of the previous archive.
    pub(crate) previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // The current blob accumulation state immediately before this checkpoint.
    // It will be outputted and checked against the `end_blob_accumulator` of the previous checkpoint in checkpoint
    // merge or root rollup. The start_blob_accumulator of the first checkpoint in an epoch must be empty, which will be
    // checked in the root rollup.
    pub(crate) start_blob_accumulator: BlobAccumulator,
    // Finalized challenges z and gamma for performing blob batching. Shared value across the epoch.
    // It will be outputted and checked against the values in other checkpoints to ensure consistency. It will be
    // confirmed in the root rollup against the last `end_blob_accumulator`.
    pub(crate) final_blob_challenges: FinalBlobBatchingChallenges,
    // Fields made of all blob data in this checkpoint. Used to compute the `end_blob_accumulator`. It will be checked
    // against the `end_sponge_blob`.
    pub(crate) blobs_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    // see blob/src/blob.nr -> evaluate_blob() -  these are used for creating each blob's challenge z_i.
    pub(crate) blob_commitments: [BLSPoint; BLOBS_PER_BLOCK],
    // Flat sha256 hash of the EVM blob hashes, can be injected here as the contract checks its validity.
    // Only exists so we have a link between EVM blob hashes and the block header for users to check.
    // NB: to fit it into a field, we truncate to 31 bytes
    pub(crate) blobs_hash: Field,
}

impl CheckpointRootRollupPrivateInputs {
    /// VkIndex: CHECKPOINT_ROOT_ROLLUP_VK_INDEX
    pub fn execute(self) -> CheckpointRollupPublicInputs {
        let hints = self.hints;
        CheckpointRootInputsValidator::new(
            self.previous_rollups,
            ALLOWED_PREVIOUS_VK_INDICES,
            hints.previous_block_header,
            hints.previous_archive_sibling_path,
        )
            .validate();

        let previous_rollups = self.previous_rollups.map(|rollup| rollup.public_inputs);
        CheckpointRollupPublicInputsComposer::new(
            previous_rollups,
            hints.start_blob_accumulator,
            hints.final_blob_challenges,
            hints.blobs_fields,
            hints.blob_commitments,
            hints.blobs_hash,
        )
            .finish()
    }
}
